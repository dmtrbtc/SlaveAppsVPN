import {
  generateSingboxConfig,
  buildClashYaml,
  isEncryptionValue,
  type ConfigGenerationContext,
  type GeneratorSettings,
} from '@slave-vpn/config'
import { DnsProfilePresets, type DnsProfile } from '@slave-vpn/dns'
import type { VPNMode } from '@slave-vpn/shared'
import { buildAggregatedProxies } from './aggregator'

/**
 * Compile a ready-to-use sing-box JSON for the Android libbox engine, given
 * the current subscription set.
 *
 * Settings we hard-code for the first Android cut:
 *   - DNS profile: "balanced" preset (DoH 1.1.1.1 + 8.8.8.8, no custom rules)
 *   - routing policy: none (engine uses MATCH→SLAVE-SELECT)
 *   - VPN mode: caller-supplied
 *   - apiPort/apiSecret: irrelevant on Android — clash_api is reachable
 *     locally inside the app process, so we use a short random secret.
 *
 * Later iterations should source DNS profile + routing policy from
 * window.slaveVPN settings once the renderer's settings store is wired
 * to Capacitor Preferences too.
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

function defaultDns(): DnsProfile {
  return DnsProfilePresets.balanced()
}

export interface CompileSingboxConfigOptions {
  vpnMode: VPNMode
  selectedProxy?: string
  utlsFingerprint?: string
}

export interface CompiledAndroidConfig {
  json: string
  proxyCount: number
  warnings: string[]
}

export async function compileSingboxConfigForAndroid(
  options: CompileSingboxConfigOptions,
): Promise<CompiledAndroidConfig> {
  const { proxies, warnings } = await buildAggregatedProxies()

  // VLESS Encryption (ML-KEM-768 / X25519) is NOT supported by the Android
  // sing-box core. Detect such nodes up front so we fail with a SPECIFIC,
  // honest reason instead of silently dropping the node or producing a config
  // sing-box can't load. (The Windows mihomo core supports it.)
  const encNodes = proxies.filter(p => isEncryptionValue(p.extra['encryption'])).map(p => p.name)
  if (options.selectedProxy && encNodes.includes(options.selectedProxy)) {
    throw new Error(
      `Сервер «${options.selectedProxy}» использует VLESS Encryption ` +
      `(пост-квантовое шифрование), которое не поддерживается Android-ядром ` +
      `(sing-box). Подключитесь к этому серверу из Windows-клиента или ` +
      `выберите другой сервер.`,
    )
  }
  if (encNodes.length > 0) {
    warnings.push(
      `Пропущены сервера с VLESS Encryption (не поддерживается Android-ядром): ` +
      encNodes.join(', '),
    )
  }

  const yaml = buildClashYaml(proxies)
  const totalProxies = proxies.length

  const generatorSettings: GeneratorSettings = {
    tunEnabled: true,
    // libbox manages the TUN fd through PlatformInterface.openTun — the
    // singbox config still needs a `tun` inbound for the engine to call
    // openTun via PlatformInterface. Stack 'mixed' is the sing-box default
    // for mobile.
    tunStack: 'mixed',
    fakeIpEnabled: false,
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
    dnsProfile: defaultDns(),
  }

  const json = generateSingboxConfig(ctx)
  return { json, proxyCount: totalProxies, warnings }
}
