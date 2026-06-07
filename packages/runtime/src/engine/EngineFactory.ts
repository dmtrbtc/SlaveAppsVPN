import type { VPNEngine, EngineType } from './VPNEngine.interface'
import { MihomoEngine } from '../mihomo/MihomoEngine'
import { SingboxEngine } from './SingboxEngine'
import { XrayEngine } from './XrayEngine'

export function createEngine(type: EngineType): VPNEngine {
  switch (type) {
    case 'mihomo':  return new MihomoEngine()
    case 'singbox': return new SingboxEngine()
    case 'xray':    return new XrayEngine()
    default:        throw new Error(`Unknown engine type: ${String(type)}`)
  }
}
