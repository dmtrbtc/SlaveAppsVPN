import {
  compileAndroidEngineConfig,
  type CompiledAndroidEngineConfig,
} from '@slave-vpn/core'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedProxies } from './adapters/subscriptions'
import { androidSettings } from './settings-store'
import { getAndroidRuleLists } from './rule-providers'
import { createAndroidStorageAdapter } from './adapters'
import { getCachedGeoSiteCategories } from './geosite-categories'

/**
 * Compile a ready-to-use **mihomo (Clash.Meta) YAML** for the Android clashbox
 * engine, given the current subscription set.
 *
 * Android runs mihomo (not sing-box) because mihomo supports VLESS Encryption
 * (ML-KEM-768 / X25519). We reuse the SAME shared `generateMihomoConfig` as
 * Windows. Shared routingPolicy/vpnMode owns route selection; Android contributes
 * only platform extras (node anti-loop, bypass rule-providers, geo auto-update,
 * and sniffer) plus its hardened DNS profile. `tunEnabled:false` because the
 * native SlaveVpnService injects the Android TUN (`tun.file-descriptor`) block.
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

export interface CompileMihomoConfigOptions {
  vpnMode: VPNMode
  selectedProxy?: string
  utlsFingerprint?: string
}

export async function compileMihomoConfigForAndroid(
  options: CompileMihomoConfigOptions,
): Promise<CompiledAndroidEngineConfig> {
  const { proxies, warnings } = await buildAggregatedProxies()
  const settings = androidSettings()
  return compileAndroidEngineConfig({
    proxies,
    aggregationWarnings: warnings,
    vpnMode: options.vpnMode,
    ...(options.selectedProxy ? { selectedProxy: options.selectedProxy } : {}),
    utlsFingerprint: options.utlsFingerprint ?? 'randomized',
    dohProvider: settings.dohProvider ?? { id: 'cloudflare' },
    enabledScenarios: settings.enabledScenarios,
    customRules: settings.customRoutingRules ?? [],
    ruleLists: getAndroidRuleLists(),
    apiSecret: randomSecret(),
    // Cache-only: the connect path must never fetch the ~4 MB geosite.dat.
    loadAvailableGeoSites: () => getCachedGeoSiteCategories(createAndroidStorageAdapter()),
  })
}
