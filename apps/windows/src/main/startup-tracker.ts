export interface StartupPhaseEntry {
  phase: string
  label: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  error?: string
}

export interface StartupReport {
  phases: StartupPhaseEntry[]
  totalMs: number
  appStartedAt: number
  completedAt: number | null
}

class StartupTracker {
  private readonly appStartedAt: number
  private readonly phases = new Map<string, StartupPhaseEntry>()
  private completedAt: number | null = null

  constructor() {
    this.appStartedAt = Date.now()
  }

  begin(phase: string, label: string): void {
    if (this.phases.has(phase)) return
    this.phases.set(phase, {
      phase,
      label,
      startedAt: Date.now(),
      completedAt: null,
      durationMs: null,
    })
  }

  complete(phase: string): void {
    const entry = this.phases.get(phase)
    if (!entry || entry.completedAt !== null) return
    entry.completedAt = Date.now()
    entry.durationMs = entry.completedAt - entry.startedAt
  }

  fail(phase: string, error: string): void {
    const entry = this.phases.get(phase)
    if (!entry) return
    entry.completedAt = Date.now()
    entry.durationMs = entry.completedAt - entry.startedAt
    entry.error = error
  }

  markComplete(): void {
    this.completedAt = Date.now()
  }

  getReport(): StartupReport {
    return {
      phases: Array.from(this.phases.values()),
      totalMs: (this.completedAt ?? Date.now()) - this.appStartedAt,
      appStartedAt: this.appStartedAt,
      completedAt: this.completedAt,
    }
  }
}

export const startupTracker = new StartupTracker()
