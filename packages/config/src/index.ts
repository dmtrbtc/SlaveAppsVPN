export { SubscriptionParser } from './parser/SubscriptionParser'
export type { ParsedProfile, ParsedProxy, ParsedProxyGroup } from './parser/ParsedProfile'

export {
  generateMihomoConfig,
  getAutoSelectGroupName,
  getSelectGroupName,
  getProxyNamesFromYaml,
} from './generator/ConfigGenerator'
export type { GeneratorSettings, ConfigGenerationContext } from './generator/ConfigGenerator'

// Subscription ingestion subsystem
export type {
  ProxyEntry,
  NormalizedSubscription,
  SubscriptionFormat,
  ValidationIssue,
  ValidationSeverity,
  CompatibilityReport,
} from './subscription'
export {
  parseProxyUri,
  parseProxyUriSafe,
  parseProxyUriList,
  isProxyUri,
  isSingBoxJson,
  parseSingBoxJson,
  buildClashYaml,
  normalizeSubscriptionContent,
  ConnectionCompatibilityValidator,
} from './subscription'
