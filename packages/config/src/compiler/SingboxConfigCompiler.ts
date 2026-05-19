import type { ConfigCompiler, CompileInput } from './ConfigCompiler'

export class SingboxConfigCompiler implements ConfigCompiler {
  readonly engineType = 'singbox' as const

  compile(_input: CompileInput): string {
    throw new Error('SingBox config compiler not yet implemented')
  }
}
