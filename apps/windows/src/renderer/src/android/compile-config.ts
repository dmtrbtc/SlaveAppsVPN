import {
  generateMihomoConfig,
  buildClashYaml,
  type ConfigGenerationContext,
  type GeneratorSettings,
} from '@slave-vpn/config'
import { buildAndroidDnsProfile } from '@slave-vpn/dns'
import { composeRoutingPolicy } from '@slave-vpn/core'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedProxies } from './aggregator'
import { resolveDohUrl, getRuleLists } from './runtime-settings'
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

  // DoH provider + rule lists come from user settings (runtime-settings store).
  const dohUrl = resolveDohUrl()
  const enabledLists = getRuleLists().filter(l => l.enabled)

  // P1.b.2 — unified routing: compose the SAME engine-ready routingPolicy
  // Windows uses from the persisted scenario set, so Android routes through the
  // shared scenario rules (Russia bypass, ad-block, streaming, …) instead of the
  // old hardcoded smart/global/direct split. When no scenarios are enabled (or
  // the composition fails validation) `policy` is null and we fall back to the
  // androidRouting rules below. availableGeoSites lets the generator drop GEOSITE
  // rules for categories the native dat lacks (mihomo fatals otherwise).
  const enabledScenarios = androidSettings().enabledScenarios
  const composed = composeRoutingPolicy(enabledScenarios)
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
    dnsProfile: buildAndroidDnsProfile({ dohUrl, nodeDomainSuffixes }),
    // Scenario rules WIN over androidRouting's smart/global/direct split (the
    // generator forces mode:'rule' when routingPolicy is present). geo / DNS /
    // node-domain anti-loop still come from androidRouting below.
    ...(composed.policy ? { routingPolicy: composed.policy } : {}),
    ...(availableGeoSites.length > 0 ? { availableGeoSites } : {}),
    androidRouting: {
      mode: options.routingMode ?? 'smart',
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
  const allWarnings = [
    ...warnings,
    ...composed.warnings,
    ...(composed.valid ? [] : composed.errors.map(e => `routing: ${e}`)),
  ]
  return { config, proxyCount: proxies.length, warnings: allWarnings }
}
