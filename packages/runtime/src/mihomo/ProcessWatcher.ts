import type { ChildProcess } from 'child_process'
import type { StopReason } from '../state/RuntimeState'

type ExitHandler = (reason: StopReason, exitCode: number | null, signal: string | null) => void

export class ProcessWatcher {
  private pendingStopReason: StopReason = 'crashed'
  private process: ChildProcess | null = null

  attach(proc: ChildProcess, onExit: ExitHandler): void {
    this.process = proc
    this.pendingStopReason = 'crashed'
    let exited = false

    proc.on('exit', (code, signal) => {
      if (exited) return
      exited = true
      const reason = this.classifyExit(code, signal)
      this.pendingStopReason = 'crashed'
      this.process = null
      onExit(reason, code, signal)
    })

    proc.on('error', (err) => {
      // A kill/send failure on a spawned child is not evidence of its death.
      // Only spawn failure (no PID) or the exit event releases ownership.
      if (exited || proc.pid !== undefined) return
      exited = true
      this.process = null
      onExit('crashed', null, null)
      void err
    })
  }

  setNextStopReason(reason: StopReason): void {
    this.pendingStopReason = reason
  }

  detach(): void {
    this.process = null
    this.pendingStopReason = 'crashed'
  }

  isAlive(): boolean {
    if (!this.process) return false
    try {
      process.kill(this.process.pid!, 0)
      return true
    } catch {
      return false
    }
  }

  private classifyExit(code: number | null, signal: string | null): StopReason {
    if (this.pendingStopReason !== 'crashed') {
      return this.pendingStopReason
    }

    if (signal === 'SIGKILL' || signal === 'SIGTERM') {
      return 'intentional'
    }

    if (code === 0) {
      return 'intentional'
    }

    return 'crashed'
  }
}
