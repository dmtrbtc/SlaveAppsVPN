import {
  buildClashYaml,
  type GeneratorSettings,
  type ProxyEntry,
} from '@slave-vpn/config'
import { buildAndroidDnsProfile } from '@slave-vpn/dns'
import type { VPNMode } from '@slave-vpn/shared'
import { resolveDohUrl, type DohProviderSetting } from '../dns/dohProviders.js'
import { resolveRoutingPolicyForMode } from '../routing/composeRoutingPolicy.js'
import type { CustomRoutingRule } from '../settings/types.js'
import { buildEngineConfig } from './buildEngineConfig.js'

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

export type AndroidRoutingModeOption = 'smart' | 'global' | 'direct'

/** Persisted Android rule-list shape consumed by the shared config compiler. */
export interface AndroidRuleListInput {
  id: string
  url: string
  behavior: 'domain' | 'ipcidr'
  enabled: boolean
  intervalHours: number
}

/**
 * Platform data required to compile the Android mihomo config. Fetching and
 * persistence stay behind the Android adapters; all routing, DNS and generator
 * orchestration lives here in core.
 */
export interface CompileAndroidEngineConfigInput {
  proxies: readonly ProxyEntry[]
  aggregationWarnings?: readonly string[]
  vpnMode: VPNMode
  selectedProxy?: string
  utlsFingerprint?: string
  routingMode?: AndroidRoutingModeOption
  dohProvider: DohProviderSetting
  enabledScenarios: readonly string[]
  customRules: readonly CustomRoutingRule[]
  ruleLists: readonly AndroidRuleListInput[]
  apiSecret: string
  /** Cache-only platform reader. Called only when a routing policy needs it. */
  loadAvailableGeoSites?: () => Promise<readonly string[]>
}

export interface CompiledAndroidEngineConfig {
  /** Clash YAML for mihomo. Native side appends `tun.file-descriptor`. */
  config: string
  proxyCount: number
  warnings: string[]
}

/** Compile a ready-to-use Android mihomo YAML from platform-provided data. */
export async function compileAndroidEngineConfig(
  input: CompileAndroidEngineConfigInput,
): Promise<CompiledAndroidEngineConfig> {
  const proxies = [...input.proxies]
  const subscriptionYaml = buildClashYaml(proxies)

  // Node domains must resolve directly from the node DNS pool to avoid routing
  // the proxy's own connection back through itself. Preserve the legacy Android
  // treatment of IPv4 literals, which do not need a domain rule.
  const nodeDomainSuffixes = [...new Set(
    proxies.map((proxy) => proxy.server).filter((server) => !!server && !IPV4_RE.test(server)),
  )]

  const composed = resolveRoutingPolicyForMode(input.vpnMode, input.enabledScenarios, {
    customRules: input.customRules,
  })
  const androidMode: AndroidRoutingModeOption =
    input.vpnMode === 'full' || input.vpnMode === 'split'
      ? 'global'
      : (input.routingMode ?? 'smart')

  const availableGeoSites = composed.policy && input.loadAvailableGeoSites
    ? await input.loadAvailableGeoSites()
    : []
  const dohUrl = resolveDohUrl(input.dohProvider)
  const enabledLists = input.ruleLists.filter((list) => list.enabled)

  const generatorSettings: GeneratorSettings = {
    // SlaveVpnService injects the Android TUN fd block natively.
    tunEnabled: false,
    tunStack: 'gvisor',
    fakeIpEnabled: true,
    dnsOverHttps: dohUrl,
    fallbackDns: ['8.8.8.8', '1.1.1.1'],
    mixedPort: 7890,
  }

  const generated = buildEngineConfig({
    subscriptionYaml,
    vpnMode: input.vpnMode,
    ...(input.selectedProxy ? { selectedProxy: input.selectedProxy } : {}),
    settings: generatorSettings,
    utlsFingerprint: input.utlsFingerprint ?? 'randomized',
    apiPort: 9090,
    apiSecret: input.apiSecret,
    dnsProfile: buildAndroidDnsProfile({
      dohUrl,
      nodeDomainSuffixes,
      ruDirectDns:
        input.vpnMode === 'bypass' ||
        input.vpnMode === 'blocked' ||
        input.vpnMode === 'custom',
      // Direct destinations need real addresses rather than fake-ip values.
      extraFakeIpFilter: input.customRules
        .filter((rule) => rule.action === 'direct')
        .map((rule) => (rule.matchType === 'suffix' ? `+.${rule.domain}` : rule.domain)),
    }),
    ...(composed.policy ? { routingPolicy: composed.policy } : {}),
    ...(composed.policy && availableGeoSites.length > 0 ? { availableGeoSites } : {}),
    androidRouting: {
      mode: androidMode,
      nodeDomainSuffixes,
      geoEnabled: true,
      bypassProviders: enabledLists.map((list) => ({
        name: list.id,
        behavior: list.behavior,
        url: list.url,
        path: `./rules/${list.id}.list`,
        intervalSeconds: Math.max(3600, Math.round(list.intervalHours * 3600)),
      })),
    },
  })

  // Surface geosite rules the generator drops because the installed database
  // does not contain their categories.
  const geositeWarnings: string[] = []
  if (composed.policy && availableGeoSites.length > 0) {
    const available = new Set(availableGeoSites.map((category) => category.toLowerCase()))
    const missing = [...new Set(
      composed.policy.rules
        .filter((rule) => rule.target.type === 'geosite' && !available.has(rule.target.value.toLowerCase()))
        .map((rule) => rule.target.value),
    )]
    if (missing.length > 0) {
      geositeWarnings.push(`маршрутизация: пропущены geosite-правила без данных: ${missing.join(', ')}`)
    }
  }

  return {
    config: generated.config,
    proxyCount: proxies.length,
    warnings: [
      ...(input.aggregationWarnings ?? []),
      ...generated.warnings,
      ...composed.warnings,
      ...geositeWarnings,
      ...(composed.valid ? [] : composed.errors.map((error) => `routing: ${error}`)),
    ],
  }
}
