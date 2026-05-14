import type { RoutingPolicy, NormalizedPolicy } from '../models/RoutingPolicy'
import type { RuleCompiler, CompiledOutput } from '../compiler/RuleCompiler'
import type { ValidationResult } from '../models/ValidationResult'
import { RoutingPipeline } from '../pipeline/RoutingPipeline'
import { RuleProviderRegistry } from '../providers/RuleProviderRegistry'
import { BundledRuleProvider } from '../providers/BundledRuleProvider'
import { RUSSIA_BYPASS_RULES, RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import { createBypassPolicy } from '../policies/BypassPolicy'
import { createFullPolicy } from '../policies/FullPolicy'

export interface RoutingManagerConfig<TOptions> {
  compiler: RuleCompiler<TOptions>
  compilerOptions: TOptions
}

export class RoutingManager<TOptions = unknown> {
  private readonly pipeline = new RoutingPipeline()
  private readonly registry = new RuleProviderRegistry()
  private _currentPolicy: NormalizedPolicy | null = null

  constructor(private readonly config: RoutingManagerConfig<TOptions>) {
    this.registry.register(
      new BundledRuleProvider(
        'bundled-bypass-private',
        'Private Networks',
        RUSSIA_BYPASS_PRIVATE_DIRECT,
        '1.0.0'
      )
    )
    this.registry.register(
      new BundledRuleProvider(
        'bundled-bypass-russia',
        'Russia Bypass Rules',
        RUSSIA_BYPASS_RULES,
        '1.0.0'
      )
    )
  }

  get registry_(): RuleProviderRegistry {
    return this.registry
  }

  applyPolicy(policy: RoutingPolicy): { result: NormalizedPolicy; validation: ValidationResult } {
    const { policy: normalized, validation } = this.pipeline.process(policy)
    this._currentPolicy = normalized
    return { result: normalized, validation }
  }

  compile(policy?: NormalizedPolicy): CompiledOutput {
    const target = policy ?? this._currentPolicy
    if (!target) throw new Error('No routing policy applied — call applyPolicy() first')
    return this.config.compiler.compile(target, this.config.compilerOptions)
  }

  applyAndCompile(policy: RoutingPolicy): { compiled: CompiledOutput; validation: ValidationResult } {
    const { result, validation } = this.applyPolicy(policy)
    const compiled = this.compile(result)
    return { compiled, validation }
  }

  getCurrentPolicy(): NormalizedPolicy | null {
    return this._currentPolicy
  }

  getDefaultBypassPolicy(): RoutingPolicy {
    return createBypassPolicy()
  }

  getDefaultFullPolicy(): RoutingPolicy {
    return createFullPolicy()
  }
}
