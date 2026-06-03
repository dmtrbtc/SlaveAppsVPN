import {
  generateMihomoConfig,
  buildClashYaml,
  type ConfigGenerationContext,
  type GeneratorSettings,
} from '@slave-vpn/config'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedProxies } from './aggregator'

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

// RKN-blocked domain list (auto-refreshed daily by mihomo). Public, GitHub-hosted
// → reliable. Blocked sites get routed THROUGH the VPN (before GEOSITE:RU→DIRECT).
const BYPASS_DOMAINS_URL =
  'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/inside-blocked-dist.lst'

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

  const generatorSettings: GeneratorSettings = {
    // The native SlaveVpnService injects the Android TUN (fd) block; the desktop
    // tun section here would carry the wrong device/auto-route for Android.
    tunEnabled: false,
    tunStack: 'gvisor',
    fakeIpEnabled: true,
    dnsOverHttps: 'https://cloudflare-dns.com/dns-query',
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
    androidRouting: {
      mode: options.routingMode ?? 'smart',
      nodeDomainSuffixes,
      geoEnabled: true,
      bypassProviders: [
        { name: 'bypass-domains', behavior: 'domain', url: BYPASS_DOMAINS_URL, path: './rules/bypass-domains.list' },
      ],
    },
  }

  const config = generateMihomoConfig(ctx)
  return { config, proxyCount: proxies.length, warnings }
}
