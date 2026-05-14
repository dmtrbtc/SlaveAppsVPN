export type {
  DnsProfile,
  DnsMode,
  DnsResolver,
  DnsResolverType,
  FakeIpConfig,
  LeakPreventionConfig,
  IPv6Config,
  SniffingConfig,
} from './profiles/DnsProfile'
export { DEFAULT_FAKE_IP_FILTER } from './profiles/FakeIpFilter'
export { DnsProfilePresets } from './profiles/DnsProfilePresets'

export type { DnsCompiler, CompiledDnsOutput, DnsCompilationMetadata } from './compiler/DnsCompiler'
export { MihomoDnsCompiler } from './compiler/MihomoDnsCompiler'

export { DnsValidator } from './manager/DnsValidator'
export type { DnsValidationResult, DnsValidationError } from './manager/DnsValidator'
export { DnsManager } from './manager/DnsManager'
