import path from 'path'
import { existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { VPN } from '@slave-vpn/shared'
import type { EngineInitConfig, TunHooks } from '@slave-vpn/runtime'

class WindowsTunHooks implements TunHooks {
  async checkTunAvailability(): Promise<boolean> {
    const binDir = path.join(process.resourcesPath ?? path.dirname(process.execPath), 'bin')
    const candidates = [
      path.join(binDir, 'wintun.dll'),
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
  const binaryPath = path.join(resourcesPath, 'bin', 'mihomo.exe')
  const binaryExists = existsSync(binaryPath)

  // [DIAG] Binary path diagnostics — helps diagnose packaged runtime issues
  const diagLines = [
    `[WindowsMihomoEngine] app.isPackaged=${(process as NodeJS.Process & { type?: string }).type !== undefined}`,
    `[WindowsMihomoEngine] process.resourcesPath=${process.resourcesPath ?? '(undefined)'}`,
    `[WindowsMihomoEngine] process.execPath=${process.execPath}`,
    `[WindowsMihomoEngine] __dirname=${__dirname}`,
    `[WindowsMihomoEngine] binaryPath=${binaryPath}`,
    `[WindowsMihomoEngine] binaryExists=${binaryExists}`,
  ]
  if (binaryExists) {
    try {
      const stat = statSync(binaryPath)
      diagLines.push(`[WindowsMihomoEngine] binarySize=${stat.size}`)
      // SHA256 of first 64 KB only (fast fingerprint, not full hash)
      const buf = readFileSync(binaryPath).slice(0, 65536)
      const partial = createHash('sha256').update(buf).digest('hex').slice(0, 16)
      diagLines.push(`[WindowsMihomoEngine] binaryHead64kSHA256=${partial}`)
    } catch { /* non-critical */ }
  }
  for (const line of diagLines) console.log(line)

  return {
    binaryPath,
    workingDir: path.join(userDataPath, 'mihomo'),
    apiPort: VPN.MIHOMO_API_PORT,
    apiSecret,
    tunHooks: new WindowsTunHooks(),
  }
}
