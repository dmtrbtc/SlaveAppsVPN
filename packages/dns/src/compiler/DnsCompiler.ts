import type { DnsProfile } from '../profiles/DnsProfile'

export interface DnsCompilationMetadata {
  readonly compiler: string
  readonly compiledAt: Date
}

export interface CompiledDnsOutput {
  readonly config: Record<string, unknown>
  readonly metadata: DnsCompilationMetadata
}

export interface DnsCompiler {
  readonly compilerType: string
  compile(profile: DnsProfile): CompiledDnsOutput
}
