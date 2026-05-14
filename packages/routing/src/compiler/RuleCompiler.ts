import type { NormalizedPolicy } from '../models/RoutingPolicy'

export interface CompiledOutput {
  readonly rules: readonly string[]
  readonly defaultTarget: string
  readonly metadata: CompilationMetadata
}

export interface CompilationMetadata {
  readonly ruleCount: number
  readonly compiler: string
  readonly compiledAt: Date
}

export interface RuleCompiler<TOptions = unknown> {
  readonly compilerType: string
  compile(policy: NormalizedPolicy, options: TOptions): CompiledOutput
}
