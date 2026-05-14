import path from 'path'
import { existsSync } from 'fs'
import { VPN } from '@slave-vpn/shared'
import type { EngineInitConfig, TunHooks } from '@slave-vpn/runtime'

class WindowsTunHooks implements TunHooks {
  async checkTunAvailability(): Promise<boolean> {
    const candidates = [
      path.join(process.resourcesPath ?? '', 'wintun.dll'),
      path.join(path.dirname(process.execPath), 'wintun.dll'),
    ]
    return candidates.some(existsSync)
  }

  async ensureTunDriver(): Promise<void> {
    // mihomo loads wintun.dll automatically when it's present alongside the binary
  }
}

export function createWindowsEngineConfig(
  userDataPath: string,
  apiSecret: string
): EngineInitConfig {
  const resourcesPath = process.resourcesPath ?? path.dirname(process.execPath)
  return {
    binaryPath: path.join(resourcesPath, 'mihomo.exe'),
    workingDir: path.join(userDataPath, 'mihomo'),
    apiPort: VPN.MIHOMO_API_PORT,
    apiSecret,
    tunHooks: new WindowsTunHooks(),
  }
}
