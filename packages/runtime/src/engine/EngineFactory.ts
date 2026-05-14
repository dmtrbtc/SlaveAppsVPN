import type { VPNEngine, EngineType } from './VPNEngine.interface'
import { MihomoEngine } from '../mihomo/MihomoEngine'

export function createEngine(type: EngineType): VPNEngine {
  switch (type) {
    case 'mihomo':
      return new MihomoEngine()
    case 'singbox':
      throw new Error('SingBox engine not yet implemented')
    case 'xray':
      throw new Error('Xray engine not yet implemented')
    default:
      throw new Error(`Unknown engine type: ${String(type)}`)
  }
}
