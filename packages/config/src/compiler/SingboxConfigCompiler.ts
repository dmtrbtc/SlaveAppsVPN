import type { ConfigCompiler, CompileInput } from './ConfigCompiler'
import { generateSingboxConfig } from './singbox/generateSingboxConfig'

export class SingboxConfigCompiler implements ConfigCompiler {
  readonly engineType = 'singbox' as const

  compile(input: CompileInput): string {
    return generateSingboxConfig(input.context)
  }
}
