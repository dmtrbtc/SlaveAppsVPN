export type { ConfigCompiler, CompileInput, CompilerEngineType } from './ConfigCompiler'
export { MihomoConfigCompiler } from './MihomoConfigCompiler'
export { SingboxConfigCompiler } from './SingboxConfigCompiler'
export { XrayConfigCompiler } from './XrayConfigCompiler'

// Direct entry point for engine use (skip the compiler wrapper)
export {
  generateSingboxConfig,
  getSlaveSelectGroup as getSingboxSelectGroup,
  getSlaveAutoGroup as getSingboxAutoGroup,
} from './singbox/generateSingboxConfig'
