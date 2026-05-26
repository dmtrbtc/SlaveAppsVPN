import path from 'path'
import { existsSync, statSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { VPN } from '@slave-vpn/shared'
import type { EngineInitConfig, TunHooks, EngineType } from '@slave-vpn/runtime'
import { getGeoUpdaterService } from '../services/GeoUpdaterService'

// Mihomo names its WinTUN adapter 'Mihomo' (from tun.device in config).
// We check netsh interface list for a live adapter with that name.
function checkNetworkAdapterExists(name: string): boolean {
  try {
    const out = execSync('netsh interface show interface', {
      encoding: 'utf8',
      timeout: 3000,
    })
    return new RegExp(name, 'i').test(out)
  } catch {
    return false
  }
}

class WindowsTunHooks implements TunHooks {
  async checkTunAvailability(): Promise<boolean> {
    // Primary: verify the WinTUN adapter named 'Mihomo' actually exists in Windows
    if (checkNetworkAdapterExists('Mihomo')) return true

    // Fallback: at least wintun.dll must be present for TUN to ever work
    const binDir = path.join(process.resourcesPath ?? path.dirname(process.execPath), 'bin')
    return existsSync(path.join(binDir, 'wintun.dll'))
  }

  async ensureTunDriver(): Promise<void> {
    // mihomo loads wintun.dll automatically when it's present alongside the binary
  }
}

// Per-engine binary + working-dir layout.
// All engines share the same Clash-compat API port (VPN.MIHOMO_API_PORT).
const ENGINE_LAYOUT: Record<EngineType, { binary: string; workingDir: string; label: string }> = {
  mihomo:  { binary: 'mihomo.exe',  workingDir: 'mihomo',  label: 'Mihomo' },
  singbox: { binary: 'sing-box.exe', workingDir: 'singbox', label: 'Sing-box' },
  xray:    { binary: 'xray.exe',     workingDir: 'xray',     label: 'Xray' },
}

export function createWindowsEngineConfig(
  userDataPath: string,
  apiSecret: string,
  engineType: EngineType = 'mihomo',
): EngineInitConfig {
  const layout = ENGINE_LAYOUT[engineType] ?? ENGINE_LAYOUT.mihomo
  const resourcesPath = process.resourcesPath ?? path.dirname(process.execPath)
  const binaryPath = path.join(resourcesPath, 'bin', layout.binary)
  const binaryExists = existsSync(binaryPath)
  const bundledRulesDir = path.join(resourcesPath, 'rules')
  // Prefer overlay (user-data) directory when it has fresher auto-updated geo
  // databases; fall back to the bundled resources directory.
  const overlayDir = (() => {
    try {
      return getGeoUpdaterService().effectiveRulesDir()
    } catch {
      return null
    }
  })()
  const rulesDir = overlayDir ?? bundledRulesDir
  const rulesExist = existsSync(rulesDir)

  // [DIAG] Binary path diagnostics — helps diagnose packaged runtime issues
  const tag = `Windows${layout.label}Engine`
  const diagLines = [
    `[${tag}] app.isPackaged=${(process as NodeJS.Process & { type?: string }).type !== undefined}`,
    `[${tag}] process.resourcesPath=${process.resourcesPath ?? '(undefined)'}`,
    `[${tag}] process.execPath=${process.execPath}`,
    `[${tag}] __dirname=${__dirname}`,
    `[${tag}] binaryPath=${binaryPath}`,
    `[${tag}] binaryExists=${binaryExists}`,
    `[${tag}] rulesDir=${rulesDir}`,
    `[${tag}] rulesExist=${rulesExist}`,
  ]
  if (binaryExists) {
    try {
      const stat = statSync(binaryPath)
      diagLines.push(`[${tag}] binarySize=${stat.size}`)
      const buf = readFileSync(binaryPath).slice(0, 65536)
      const partial = createHash('sha256').update(buf).digest('hex').slice(0, 16)
      diagLines.push(`[${tag}] binaryHead64kSHA256=${partial}`)
    } catch { /* non-critical */ }
  }
  for (const line of diagLines) console.log(line)

  return {
    binaryPath,
    workingDir: path.join(userDataPath, layout.workingDir),
    apiPort: VPN.MIHOMO_API_PORT,
    apiSecret,
    // TUN hooks are mihomo-specific; sing-box manages its own TUN adapter.
    // We keep checking wintun.dll presence as a generic sanity check.
    tunHooks: new WindowsTunHooks(),
    ...(rulesExist ? { rulesDir } : {}),
  }
}
