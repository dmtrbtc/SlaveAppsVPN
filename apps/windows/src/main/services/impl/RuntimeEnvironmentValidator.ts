import { existsSync, mkdirSync, accessSync, writeFileSync, unlinkSync, constants } from 'fs'
import { join, dirname } from 'path'
import net from 'net'
import { execSync } from 'child_process'

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

// Kill any process listening on the given port (Windows-only: netstat + taskkill).
// Returns true if at least one orphan was found and killed.
function killOrphanOnPort(port: number): boolean {
  try {
    const output = execSync('netstat -ano', { encoding: 'utf8', timeout: 4000 })
    const pids = new Set<string>()
    const portRe = new RegExp(`:${port}\\s`)
    for (const line of output.split('\n')) {
      const upper = line.toUpperCase()
      if (!portRe.test(line)) continue
      if (!upper.includes('LISTENING') && !upper.includes('LISTEN')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { timeout: 3000 }) } catch { /* ignore */ }
    }
    return pids.size > 0
  } catch {
    return false
  }
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  // ── 4. API port: clean up orphan, then verify ────────────────────────────
  const portFree = await isPortFree(config.apiPort)
  if (!portFree) {
    const killed = killOrphanOnPort(config.apiPort)
    if (killed) {
      await delay(500)
      const freeNow = await isPortFree(config.apiPort)
      if (!freeNow) {
        issues.push({
          code: 'API_PORT_IN_USE',
          message: `Port ${config.apiPort} is still occupied after orphan cleanup. Another service may be using it.`,
          fatal: false,
        })
      }
      // else: port was freed — no issue to report
    } else {
      issues.push({
        code: 'API_PORT_IN_USE',
        message: `Port ${config.apiPort} is occupied. A previous Mihomo instance may still be running.`,
        fatal: false,
      })
    }
  }

  return {
    ok: !issues.some(i => i.fatal),
    issues,
  }
}
