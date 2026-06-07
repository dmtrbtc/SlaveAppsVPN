export { applyUtlsRotation } from './utls/applyUtlsRotation'
export type { UtlsFingerprint, ApplyUtlsRotationOptions } from './utls/applyUtlsRotation'

export {
  parseVlessEncryption,
  validateVlessEncryption,
  transformEncryptionForSingbox,
  isEncryptionValue,
  XRAY_HANDSHAKE,
  SINGBOX_HANDSHAKE,
} from './encryption/vlessEncryption'
export type {
  ParsedVlessEncryption,
  EncryptionValidation,
  EncHandshakeKind,
  EncAppearance,
  EncRtt,
} from './encryption/vlessEncryption'

export type { ConfigCompiler, CompileInput, CompilerEngineType } from './compiler'
export {
  MihomoConfigCompiler,
  SingboxConfigCompiler,
  XrayConfigCompiler,
  generateSingboxConfig,
  getSingboxSelectGroup,
  getSingboxAutoGroup,
} from './compiler'

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
  parseProxiesFromYaml,
  parseXrayConfigArray,
  isXrayConfigArray,
} from './subscription'
