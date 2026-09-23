import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { ProcessWatcher } from './ProcessWatcher'
import type { StopReason } from '../state/RuntimeState'
import type { EngineEventBus } from '../engine/EngineEvents'

// Mihomo writes structured log lines to stdout:
//   time="..." level=info msg="..."
//   time="..." level=warning msg="..."
//   time="..." level=error msg="..."
// Parse the embedded level so downstream handlers can filter properly.
function parseMihomoLogLevel(line: string): 'debug' | 'info' | 'warn' | 'error' {
  const m = line.match(/\blevel=(\w+)/)
  if (!m) return 'info'
  switch (m[1]) {
    case 'error':                  return 'error'
    case 'warning': case 'warn':   return 'warn'
    case 'debug':   case 'trace':  return 'debug'
    default:                       return 'info'
  }
}

interface ProcessManagerConfig {
  binaryPath: string
  workingDir: string
  configPath: string
  apiPort: number
  apiSecret: string
}

export class ProcessManager {
  private process: ChildProcess | null = null
  private readonly watcher = new ProcessWatcher()
  private config: ProcessManagerConfig | null = null

  constructor(private readonly events: EngineEventBus) {}

  configure(config: ProcessManagerConfig): void {
    this.config = config
  }

  async spawn(onExit: (reason: StopReason, code: number | null) => void): Promise<void> {
    if (!this.config) throw new Error('ProcessManager not configured')
    if (this.process) throw new Error('Process already running')

    const { binaryPath, workingDir, configPath, apiPort, apiSecret } = this.config

    if (!existsSync(binaryPath)) {
      throw new Error(`Mihomo binary not found: ${binaryPath}`)
    }

    const args = ['-f', configPath, '-d', workingDir]

    // [DIAG] Spawn diagnostics
    console.log(`[ProcessManager] spawn binaryPath=${binaryPath}`)
    console.log(`[ProcessManager] spawn args=${JSON.stringify(args)}`)
    console.log(`[ProcessManager] spawn cwd=${workingDir}`)
    console.log(`[ProcessManager] MIHOMO_EXTERNAL_CONTROLLER=127.0.0.1:${apiPort}`)

    const proc = spawn(binaryPath, args, {
      cwd: workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        MIHOMO_EXTERNAL_CONTROLLER: `127.0.0.1:${apiPort}`,
        MIHOMO_SECRET: apiSecret,
      },
    })

    this.process = proc

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.events.emit('logLine', { level: parseMihomoLogLevel(line), message: line })
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        // stderr from Mihomo is always unexpected — treat as error
        this.events.emit('logLine', { level: 'error', message: line })
      }
    })

    this.watcher.attach(proc, (reason, code) => {
      this.process = null
      onExit(reason, code)
    })
  }

  async kill(reason: StopReason = 'intentional'): Promise<void> {
    if (!this.process) return

    this.watcher.setNextStopReason(reason)

    return new Promise((resolve) => {
      const proc = this.process!

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL')
        resolve()
      }, 5_000)

      proc.once('exit', () => {
        clearTimeout(timeout)
        this.process = null
        resolve()
      })

      proc.kill('SIGTERM')
    })
  }

  isRunning(): boolean {
    return this.process !== null && this.watcher.isAlive()
  }

  getPid(): number | null {
    return this.process?.pid ?? null
  }

  setNextStopReason(reason: StopReason): void {
    this.watcher.setNextStopReason(reason)
  }
}
