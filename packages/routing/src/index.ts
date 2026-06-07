export type { RoutingRule, RuleTarget, RuleSource, RuleTargetType, RuleAction } from './models/RoutingRule'
export type { RoutingPolicy, NormalizedPolicy, RoutingMode } from './models/RoutingPolicy'
export type { GeoRule, GeoCategory } from './models/GeoRule'
export type { SplitTunnelTarget, SplitTunnelRule, SplitTunnelPlatform } from './models/SplitTunnelTarget'
export type { ValidationResult, ValidationError, ValidationWarning } from './models/ValidationResult'
export { mergeValidationResults } from './models/ValidationResult'
export { emptyPolicy } from './models/RoutingPolicy'

export { PolicyNormalizer } from './pipeline/PolicyNormalizer'
export { PolicyValidator } from './pipeline/PolicyValidator'
export { PolicyOptimizer } from './pipeline/PolicyOptimizer'
export { RoutingPipeline } from './pipeline/RoutingPipeline'
export type { PipelineResult } from './pipeline/RoutingPipeline'

export type { RuleCompiler, CompiledOutput, CompilationMetadata } from './compiler/RuleCompiler'
export { MihomoRuleCompiler } from './compiler/MihomoRuleCompiler'
export type { MihomoCompilerOptions } from './compiler/MihomoRuleCompiler'

export type { RuleProvider, RuleProviderMetadata, RuleProviderType } from './providers/RuleProvider'
// Cache/Remote rule providers import Node built-ins (fs/path/https/crypto)
// and are server-only. They are NOT re-exported from the public surface so
// the renderer's vite bundle doesn't pull them via tree-shake. Import them
// directly via `@slave-vpn/routing/providers/CacheRuleProvider` etc. in the
// main process when needed.
export type { RemoteRuleProviderConfig } from './providers/RemoteRuleProvider'

export { RUSSIA_BYPASS_RULES, RUSSIA_BYPASS_PRIVATE_DIRECT } from './data/bypass-rules'

export { createFullPolicy } from './policies/FullPolicy'
export { createBypassPolicy } from './policies/BypassPolicy'
export { createSplitPolicy } from './policies/SplitPolicy'
export { createCustomPolicy } from './policies/CustomPolicy'
export type { CustomPolicyConfig } from './policies/CustomPolicy'

// RoutingManager + providers/registry pull Node-only deps and are
// server-only. Import directly from the subpath in main process if needed.
export type { RoutingManagerConfig } from './manager/RoutingManager'

// Engine-neutral routing scenarios (Karing-style ready-to-use recipes)
export type {
  RoutingScenario,
  ScenarioId,
  ScenarioCategory,
  ScenarioMetadata,
  ComposeResult,
} from './scenarios'
export {
  listScenarios,
  listScenarioMetadata,
  getScenarioById,
  composeScenarios,
  getDefaultEnabledScenarios,
} from './scenarios'
