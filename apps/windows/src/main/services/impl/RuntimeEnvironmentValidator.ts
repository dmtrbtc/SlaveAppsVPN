import { existsSync, mkdirSync, accessSync, writeFileSync, unlinkSync, constants } from 'fs'
import { join, dirname } from 'path'
import net from 'net'

export interface ValidationIssue {
  code: string
  message: string
  fatal: boolean
}

export interface PreflightResult {
  ok: boolean
  issues: ValidationIssue[]
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => { server.close(() => resolve(true)) })
    server.listen(port, '127.0.0.1')
  })
}

function isDirectoryWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${Date.now()}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export async function validateRuntimeEnvironment(config: {
  binaryPath: string
  workingDir: string
  apiPort: number
}): Promise<PreflightResult> {
  const issues: ValidationIssue[] = []

  // ── 1. Engine binary ──────────────────────────────────────────────────────
  if (!existsSync(config.binaryPath)) {
    issues.push({
      code: 'ENGINE_MISSING',
      message: `Mihomo binary not found at: ${config.binaryPath}. Please reinstall the application.`,
      fatal: true,
    })
  } else {
    try {
      accessSync(config.binaryPath, constants.F_OK)
    } catch {
      issues.push({
        code: 'ENGINE_NOT_READABLE',
        message: `Mihomo binary exists but is not accessible. Try running as administrator.`,
        fatal: true,
      })
    }
  }

  // ── 2. WinTUN driver (TUN mode) ──────────────────────────────────────────
  const binDir = dirname(config.binaryPath)
  const wintunPath = join(binDir, 'wintun.dll')
  if (!existsSync(wintunPath)) {
    issues.push({
      code: 'TUN_DRIVER_MISSING',
      message: 'wintun.dll not found — TUN mode disabled. System proxy mode will be used.',
      fatal: false,
    })
  }

  // ── 3. Working directory writable ────────────────────────────────────────
  if (!isDirectoryWritable(config.workingDir)) {
    issues.push({
      code: 'WORKDIR_UNWRITABLE',
      message: `Cannot write to working directory: ${config.workingDir}. Try running as administrator.`,
      fatal: true,
    })
  }

  // ── 4. API port availability ─────────────────────────────────────────────
  const portFree = await isPortFree(config.apiPort)
  if (!portFree) {
    issues.push({
      code: 'API_PORT_IN_USE',
      message: `Port ${config.apiPort} is occupied — a previous Mihomo instance may still be running.`,
      fatal: false,
    })
  }

  return {
    ok: !issues.some(i => i.fatal),
    issues,
  }
}
