import { generateMihomoConfig } from '../generator/ConfigGenerator'
import type { ConfigCompiler, CompileInput } from './ConfigCompiler'

export class MihomoConfigCompiler implements ConfigCompiler {
  readonly engineType = 'mihomo' as const

  compile(input: CompileInput): string {
    return generateMihomoConfig(input.context)
  }
}
