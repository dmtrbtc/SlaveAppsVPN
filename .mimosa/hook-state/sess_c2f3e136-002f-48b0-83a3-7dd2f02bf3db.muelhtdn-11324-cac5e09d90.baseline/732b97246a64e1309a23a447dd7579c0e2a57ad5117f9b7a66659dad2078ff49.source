import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { ProcessWatcher } from '../mihomo/ProcessWatcher'
import type { StopReason } from '../state/RuntimeState'
import type { EngineEventBus } from '../engine/EngineEvents'

// Sing-box prefixes lines with " INFO ", " WARN ", " ERROR ", " FATAL " when
// using the default text formatter. With timestamp:true it adds "+0000 YYYY-...".
function parseSingboxLogLevel(line: string): 'debug' | 'info' | 'warn' | 'error' {
  if (/\s(FATAL|ERROR)\s/.test(line)) return 'error'
  if (/\s(WARN|WARNING)\s/.test(line)) return 'warn'
  if (/\s(DEBUG|TRACE)\s/.test(line)) return 'debug'
  return 'info'
}

interface ProcessManagerConfig {
  binaryPath: string
  workingDir: string
  configPath: string
  apiPort: number       // for diagnostics only; sing-box reads from config
  apiSecret: string
}

export class SingboxProcessManager {
  private process: ChildProcess | null = null
  private readonly watcher = new ProcessWatcher()
  private config: ProcessManagerConfig | null = null

  constructor(private readonly events: EngineEventBus) {}

  configure(config: ProcessManagerConfig): void {
    this.config = config
  }

  async spawn(onExit: (reason: StopReason, code: number | null) => void): Promise<void> {
    if (!this.config) throw new Error('SingboxProcessManager not configured')
    if (this.process) throw new Error('Process already running')

    const { binaryPath, workingDir, configPath } = this.config

    if (!existsSync(binaryPath)) {
      throw new Error(
        `Sing-box binary not found: ${binaryPath}. ` +
        `Download from https://github.com/SagerNet/sing-box/releases and place into resources/bin/sing-box.exe.`,
      )
    }

    // sing-box CLI: `sing-box run -c <config>` ; workingDir resolved via cwd
    const args = ['run', '-c', configPath, '-D', workingDir]

    console.log(`[SingboxProcessManager] spawn binaryPath=${binaryPath}`)
    console.log(`[SingboxProcessManager] spawn args=${JSON.stringify(args)}`)
    console.log(`[SingboxProcessManager] spawn cwd=${workingDir}`)

    const proc = spawn(binaryPath, args, {
      cwd: workingDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.process = proc

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.events.emit('logLine', { level: parseSingboxLogLevel(line), message: line })
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
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
