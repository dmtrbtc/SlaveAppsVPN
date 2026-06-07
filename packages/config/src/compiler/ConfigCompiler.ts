import type { GeneratorSettings, ConfigGenerationContext } from '../generator/ConfigGenerator'

export type CompilerEngineType = 'mihomo' | 'singbox' | 'xray'

export interface CompileInput {
  context: ConfigGenerationContext
  settings: GeneratorSettings
}

export interface ConfigCompiler {
  readonly engineType: CompilerEngineType
  compile(input: CompileInput): string
}
