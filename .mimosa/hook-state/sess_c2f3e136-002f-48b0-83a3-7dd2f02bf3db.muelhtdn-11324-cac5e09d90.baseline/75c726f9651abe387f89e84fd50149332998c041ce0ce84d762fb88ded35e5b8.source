import { randomUUID } from 'crypto'
import type { RuntimeManager } from '@slave-vpn/runtime'
import { IpcChannel } from '../../shared/ipc/channels'
import { sendToRenderer } from '../window'
import { getLogger } from '../logger'

interface RecoveryPolicy {
  maxAttempts: number
  backoffMs: number[]  // per-attempt delay; last element repeated
}

const DEFAULT_POLICY: RecoveryPolicy = {
  maxAttempts: 5,
  backoffMs: [1_000, 2_000, 4_000, 8_000, 16_000],
}

function backoffDelay(policy: RecoveryPolicy, attempt: number): number {
  const idx = Math.min(attempt, policy.backoffMs.length - 1)
  return policy.backoffMs[idx] ?? 16_000
}

function makeRuntimeEvent(
  kind: string,
  severity: 'info' | 'warning' | 'error' | 'critical',
  message: string,
  metadata?: Record<string, unknown>
): object {
  return {
    id: randomUUID(),
    kind,
    severity,
    timestamp: Date.now(),
    message,
    ...(metadata !== undefined ? { metadata } : {}),
  }
}

export class RecoveryCoordinator {
  private readonly manager: RuntimeManager
  private readonly policy: RecoveryPolicy
  private attempts = 0
  private recovering = false
  private recoverTimer: ReturnType<typeof setTimeout> | null = null
  private connectFn: (() => Promise<void>) | null = null

  constructor(manager: RuntimeManager, policy: RecoveryPolicy = DEFAULT_POLICY) {
    this.manager = manager
    this.policy = policy

    manager.on('stateChanged', ({ state }) => {
      if (state === 'running') {
        this.onRecovered()
      } else if (state === 'error' || state === 'crashed') {
        this.scheduleRecovery()
      }
    })
  }

  setConnectFn(fn: () => Promise<void>): void {
    this.connectFn = fn
  }

  private onRecovered(): void {
    if (this.recovering) {
      const log = getLogger()
      log.info({ attempts: this.attempts }, 'RecoveryCoordinator: VPN recovered')
      sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
        makeRuntimeEvent('reconnect.success', 'info',
          `VPN восстановлен после ${this.attempts} попыток`, { attempts: this.attempts }))
    }
    this.reset()
  }

  private scheduleRecovery(): void {
    if (this.recovering) return  // already in a recovery cycle
    if (!this.connectFn) return  // no connect function registered

    this.recovering = true
    this.doRecoveryAttempt()
  }

  private doRecoveryAttempt(): void {
    if (this.attempts >= this.policy.maxAttempts) {
      this.onExhausted()
      return
    }

    const delay = backoffDelay(this.policy, this.attempts)
    this.attempts++

    getLogger().info({ attempt: this.attempts, delayMs: delay }, 'RecoveryCoordinator: scheduling reconnect')
    sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
      makeRuntimeEvent('reconnect.attempt', 'warning',
        `Попытка переподключения ${this.attempts}/${this.policy.maxAttempts}`,
        { attempt: this.attempts, maxAttempts: this.policy.maxAttempts, delayMs: delay }))

    this.recoverTimer = setTimeout(() => {
      const state = this.manager.getState()
      // Only attempt if still in a failed state
      if (state !== 'error' && state !== 'crashed' && state !== 'idle') {
        this.reset()
        return
      }
      this.connectFn?.().catch((err: unknown) => {
        getLogger().warn({ err, attempt: this.attempts }, 'RecoveryCoordinator: reconnect attempt failed')
        if (this.recovering) {
          this.doRecoveryAttempt()
        }
      })
    }, delay)
  }

  private onExhausted(): void {
    getLogger().error({ attempts: this.attempts }, 'RecoveryCoordinator: recovery exhausted')
    sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT,
      makeRuntimeEvent('reconnect.exhausted', 'critical',
        'VPN не удалось восстановить — требуется ручное вмешательство',
        { attempts: this.attempts }))
    this.reset()
  }

  private reset(): void {
    if (this.recoverTimer !== null) {
      clearTimeout(this.recoverTimer)
      this.recoverTimer = null
    }
    this.recovering = false
    this.attempts = 0
  }

  dispose(): void {
    this.reset()
  }
}
