import {
  generateMihomoConfig,
  buildClashYaml,
  type ConfigGenerationContext,
  type GeneratorSettings,
} from '@slave-vpn/config'
import { buildAndroidDnsProfile } from '@slave-vpn/dns'
import { resolveRoutingPolicyForMode, resolveDohUrl } from '@slave-vpn/core'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedProxies } from './aggregator'
import { getDnsProvider, getRuleLists } from './runtime-settings'
import { androidSettings } from './settings-store'
import { createAndroidStorageAdapter } from './adapters'
import { getCachedGeoSiteCategories } from './geosite-categories'

/**
 * Compile a ready-to-use **mihomo (Clash.Meta) YAML** for the Android clashbox
 * engine, given the current subscription set.
 *
 * Android runs mihomo (not sing-box) because mihomo supports VLESS Encryption
 * (ML-KEM-768 / X25519). We reuse the SAME shared `generateMihomoConfig` as
 * Windows; the Android-specific behavior comes from the `androidRouting` option
 * (smart RU split tunnelling, bypass rule-providers, geo auto-download, and a
 * hardened DNS section — issue #9). `tunEnabled:false` because the native
 * SlaveVpnService injects the Android TUN (`tun.file-descriptor`) block.
 */

function randomSecret(): string {
  const buf = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
}

export type AndroidRoutingModeOption = 'smart' | 'global' | 'direct'

export interface CompileMihomoConfigOptions {
  vpnMode: VPNMode
  selectedProxy?: string
  utlsFingerprint?: string
  /** Smart RU split (default) / Global (all via VPN) / Direct (diagnostics). */
  routingMode?: AndroidRoutingModeOption
}

export interface CompiledAndroidConfig {
  /** Clash YAML for mihomo. Native side appends `tun.file-descriptor`. */
  config: string
  proxyCount: number
  warnings: string[]
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

export async function compileMihomoConfigForAndroid(
  options: CompileMihomoConfigOptions,
): Promise<CompiledAndroidConfig> {
  const { proxies, warnings } = await buildAggregatedProxies()
  const yaml = buildClashYaml(proxies)

  // Node domains → DIRECT (anti-loop) — derived from the actual proxy servers,
  // so it works for any subscription. IP servers don't need it (mihomo dials
  // them directly, not via the rule engine).
  const nodeDomainSuffixes = [...new Set(
    proxies.map(p => p.server).filter((s): s is string => !!s && !IPV4_RE.test(s)),
  )]

  // DoH provider now lives in unified AppSettings (shared with Windows); fall back
  // to the legacy runtime-settings store so installs that picked a provider before
  // the migration keep their choice. Rule lists stay in the runtime-settings store.
  const dohUrl = resolveDohUrl(androidSettings().dohProvider ?? getDnsProvider())
  const enabledLists = getRuleLists().filter(l => l.enabled)

  // P1.b.2 — unified routing: compose the SAME engine-ready routingPolicy
  // Windows uses from the persisted scenario set, so Android routes through the
  // shared scenario rules (Russia bypass, ad-block, streaming, …) instead of the
  // old hardcoded smart/global/direct split. When no scenarios are enabled (or
  // the composition fails validation) `policy` is null and we fall back to the
  // androidRouting rules below. availableGeoSites lets the generator drop GEOSITE
  // rules for categories the native dat lacks (mihomo fatals otherwise).
  // The VPN mode is the master routing control (same as Windows): full/split →
  // null policy (fall through to androidRouting below), bypass → Smart-Russia,
  // custom → the user's enabled scenarios. Before this, scenarios always won and
  // the Полный/Раздельный selection did nothing.
  const enabledScenarios = androidSettings().enabledScenarios
  // «Свои правила» — user per-domain overrides, applied in EVERY mode above the
  // scenario rules. Android split omits splitProcesses (apps are gated natively
  // by VpnService), so a split policy keeps its proxy-default semantics.
  const customRules = androidSettings().customRoutingRules ?? []
  const composed = resolveRoutingPolicyForMode(options.vpnMode, enabledScenarios, {
    customRules,
  })

  // When no scenario policy applies (full/split), the androidRouting mode drives
  // the rules: full/split → 'global' (everything in the tunnel goes via VPN; on
  // Android the native VpnService decides WHICH apps enter the tunnel for split),
  // custom-without-scenarios → the explicit routingMode (default smart).
  const androidMode: AndroidRoutingModeOption =
    options.vpnMode === 'full' || options.vpnMode === 'split'
      ? 'global'
      : (options.routingMode ?? 'smart')
  // Cache-ONLY read — must NOT fetch the ~4MB geosite.dat here, or a cold first
  // connect blocks past the 15s IPC timeout («[IPC] request time out», works on
  // the 2nd try once warm). The startup prefetch fills the cache; [] is safe
  // (no GEOSITE filter; default scenarios only use category-ru, always present).
  const availableGeoSites = composed.policy
    ? await getCachedGeoSiteCategories(createAndroidStorageAdapter())
    : []

  const generatorSettings: GeneratorSettings = {
    // The native SlaveVpnService injects the Android TUN (fd) block; the desktop
    // tun section here would carry the wrong device/auto-route for Android.
    tunEnabled: false,
    tunStack: 'gvisor',
    fakeIpEnabled: true,
    dnsOverHttps: dohUrl,
    fallbackDns: ['8.8.8.8', '1.1.1.1'],
    mixedPort: 7890,
  }

  const ctx: ConfigGenerationContext = {
    subscriptionYaml: yaml,
    vpnMode: options.vpnMode,
    ...(options.selectedProxy ? { selectedProxy: options.selectedProxy } : {}),
    settings: generatorSettings,
    utlsFingerprint: options.utlsFingerprint ?? 'randomized',
    apiPort: 9090,
    apiSecret: randomSecret(),
    // Unified DNS (P2): the hardened Android DNS section now comes from the
    // shared DnsProfile/MihomoDnsCompiler path (same as Windows) instead of the
    // inline buildAndroidDnsSection. Verified byte-identical to the old output.
    // RU-direct DNS (resolve RU via a Russian resolver, keep direct) only when RU
    // actually goes direct — i.e. «Обход»/«Свой». In «Полный»/«Раздельный» RU also
    // tunnels, so resolve it via DoH (no plaintext RU DNS leak).
    dnsProfile: buildAndroidDnsProfile({
      dohUrl,
      nodeDomainSuffixes,
      ruDirectDns:
        options.vpnMode === 'bypass' ||
        options.vpnMode === 'blocked' ||
        options.vpnMode === 'custom',
      // User DIRECT rules must resolve to REAL IPs (not fake-ip), or the app
      // gets a synthetic 198.18.x address despite routing DIRECT.
      extraFakeIpFilter: customRules
        .filter((r) => r.action === 'direct')
        .map((r) => (r.matchType === 'suffix' ? `+.${r.domain}` : r.domain)),
    }),
    // Scenario rules WIN over androidRouting's smart/global/direct split (the
    // generator forces mode:'rule' when routingPolicy is present). geo / DNS /
    // node-domain anti-loop still come from androidRouting below.
    ...(composed.policy ? { routingPolicy: composed.policy } : {}),
    ...(availableGeoSites.length > 0 ? { availableGeoSites } : {}),
    androidRouting: {
      mode: androidMode,
      nodeDomainSuffixes,
      geoEnabled: true,
      // User-managed rule lists (enabled only) → mihomo rule-providers.
      bypassProviders: enabledLists.map(l => ({
        name: l.id,
        behavior: l.behavior,
        url: l.url,
        path: `./rules/${l.id}.list`,
        intervalSeconds: Math.max(3600, Math.round(l.intervalHours * 3600)),
      })),
    },
  }

  const config = generateMihomoConfig(ctx)
  // Surface geosite rules the generator will DROP (category absent from the
  // installed dat) — silently losing e.g. an RKN category means the user thinks
  // they're covered by a list that isn't loaded. Mirror of the generator's own
  // filterUnknownGeoSiteRules condition (only when the available set is known).
  const geositeWarnings: string[] = []
  if (composed.policy && availableGeoSites.length > 0) {
    const available = new Set(availableGeoSites.map(c => c.toLowerCase()))
    const missing = [...new Set(
      composed.policy.rules
        .filter(r => r.target.type === 'geosite' && !available.has(r.target.value.toLowerCase()))
        .map(r => r.target.value),
    )]
    if (missing.length > 0) {
      geositeWarnings.push(`маршрутизация: пропущены geosite-правила без данных: ${missing.join(', ')}`)
    }
  }
  const allWarnings = [
    ...warnings,
    ...composed.warnings,
    ...geositeWarnings,
    ...(composed.valid ? [] : composed.errors.map(e => `routing: ${e}`)),
  ]
  return { config, proxyCount: proxies.length, warnings: allWarnings }
}
