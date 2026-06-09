export type {
  DnsPresetName,
  DnsStrategyName,
  DnsResolverKind,
  DnsRuleMatchKind,
  CustomDnsResolver,
  CustomDnsRule,
  DnsProfileConfig,
  DnsStrategyInfo,
  DnsPresetInfo,
} from './types.js'
export {
  DNS_STRATEGIES,
  DNS_PRESETS,
  DNS_PRESET_CONFIGS,
  buildDnsProfileConfig,
  getDnsPresets,
  getDnsStrategies,
} from './presets.js'
export { resolveDnsProfile } from './resolveDnsProfile.js'
