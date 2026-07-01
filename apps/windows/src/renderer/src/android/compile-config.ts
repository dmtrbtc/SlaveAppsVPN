import {
  generateMihomoConfig,
  type ConfigGenerationContext,
  type GeneratorSettings,
} from '@slave-vpn/config'
import { DnsProfilePresets, type DnsProfile } from '@slave-vpn/dns'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedYaml } from './aggregator'

/**
 * Compile a ready-to-use **mihomo (Clash.Meta) YAML** for the Android clashbox
 * engine, given the current subscription set.
 *
 * Android now runs mihomo (not sing-box) because mihomo supports VLESS
 * Encryption (ML-KEM-768 / X25519). We reuse the SAME shared
 * `generateMihomoConfig` as Windows, so enc nodes are passed through verbatim
 * and no longer skipped.
 *
 * Two Android-specific choices:
 *   - `tunEnabled: false` — the native SlaveVpnService injects the Android TUN
 *     block (`tun.file-descriptor: <fd>`) once it has the VpnService fd.
 *   - DNS = balanced preset WITHOUT fallback nameservers, so the mihomo DNS
 *     compiler emits no `fallback-filter`/geoip (no geo database ships on
 *     Android). Routing uses only the built-in `GEOIP,private` rule.
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

function androidDns(): DnsProfile {
  // Two Android adjustments to the balanced preset:
  //  - drop fallback nameservers → mihomo emits no geoip `fallback-filter`
  //    (no Country DB ships on Android);
  //  - useSystemDns:true → mihomo does NOT emit `respect-rules`, which would
  //    otherwise REQUIRE `proxy-server-nameserver` (and create a chicken-and-egg
  //    resolving the proxy server's own domain). DNS resolves directly via the
  //    configured DoH nameservers instead.
  const base = DnsProfilePresets.balanced()
  return {
    ...base,
    fallbackNameservers: [],
    leakPrevention: { ...base.leakPrevention, useSystemDns: true },
  }
}

export interface CompileMihomoConfigOptions {
  vpnMode: VPNMode
  selectedProxy?: string
  utlsFingerprint?: string
}

export interface CompiledAndroidConfig {
  /** Clash YAML for mihomo. Native side appends `tun.file-descriptor`. */
  config: string
  proxyCount: number
  warnings: string[]
}

export async function compileMihomoConfigForAndroid(
  options: CompileMihomoConfigOptions,
): Promise<CompiledAndroidConfig> {
  const { yaml, totalProxies, warnings } = await buildAggregatedYaml()

  const generatorSettings: GeneratorSettings = {
    // The native SlaveVpnService injects the Android TUN (fd) block; the desktop
    // tun section here would carry the wrong device/auto-route for Android.
    tunEnabled: false,
    tunStack: 'gvisor',
    fakeIpEnabled: true,
    dnsOverHttps: 'https://1.1.1.1/dns-query',
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
    dnsProfile: androidDns(),
  }

  const config = generateMihomoConfig(ctx)
  return { config, proxyCount: totalProxies, warnings }
}
