import type { RuntimeState, RuntimeStateTransition } from './RuntimeState'

type TransitionListener = (transition: RuntimeStateTransition) => void

const VALID_TRANSITIONS = new Map<RuntimeState, Set<RuntimeState>>([
  ['idle',         new Set<RuntimeState>(['starting'])],
  ['starting',     new Set<RuntimeState>(['running', 'error', 'idle'])],
  ['running',      new Set<RuntimeState>(['stopping', 'crashed', 'reconnecting'])],
  ['stopping',     new Set<RuntimeState>(['idle', 'error'])],
  ['crashed',      new Set<RuntimeState>(['reconnecting', 'error', 'idle'])],
  ['reconnecting', new Set<RuntimeState>(['starting', 'error', 'idle'])],
  ['error',        new Set<RuntimeState>(['idle'])],
])

export class RuntimeStateMachine {
  private _state: RuntimeState = 'idle'
  private readonly listeners = new Set<TransitionListener>()
  private readonly history: RuntimeStateTransition[] = []

  get state(): RuntimeState {
    return this._state
  }

  canTransition(to: RuntimeState): boolean {
    return VALID_TRANSITIONS.get(this._state)?.has(to) ?? false
  }

  transition(to: RuntimeState, reason?: string): RuntimeStateTransition {
    if (!this.canTransition(to)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${to}. ` +
        `Allowed from ${this._state}: [${[...(VALID_TRANSITIONS.get(this._state) ?? [])].join(', ')}]`
      )
    }

    const t: RuntimeStateTransition = {
      from: this._state,
      to,
      reason,
      timestamp: Date.now(),
    }

    this._state = to
    this.history.push(t)

    if (this.history.length > 100) {
      this.history.shift()
    }

    for (const listener of this.listeners) {
      try { listener(t) } catch { /* listener errors must not affect FSM */ }
    }

    return t
  }

  tryTransition(to: RuntimeState, reason?: string): boolean {
    if (!this.canTransition(to)) return false
    this.transition(to, reason)
    return true
  }

  forceReset(): void {
    const prev = this._state
    this._state = 'idle'
    this.history.push({ from: prev, to: 'idle', reason: 'force_reset', timestamp: Date.now() })
  }

  onTransition(listener: TransitionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getHistory(): readonly RuntimeStateTransition[] {
    return this.history
  }

  isTerminal(): boolean {
    return this._state === 'idle' || this._state === 'error'
  }

  isActive(): boolean {
    return this._state === 'running' || this._state === 'reconnecting'
  }
}
