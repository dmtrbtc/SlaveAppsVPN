import type { ProbeResult, NodeHealthSnapshot } from './types'

const DEFAULT_QUARANTINE_THRESHOLD = 3
const DEFAULT_QUARANTINE_DURATION_MS = 5 * 60_000   // 5 minutes
const DEFAULT_ROLLING_WINDOW = 5

interface NodeState {
  id: string
  consecutiveFailures: number
  rttSamples: number[]            // circular buffer of last N RTTs
  quarantinedUntil: number | null
  lastProbed: number | null
}

export class NodeHealthTracker {
  private readonly quarantineThreshold: number
  private readonly quarantineDurationMs: number
  private readonly rollingWindowSize: number
  private readonly nodes = new Map<string, NodeState>()

  constructor(
    quarantineThreshold = DEFAULT_QUARANTINE_THRESHOLD,
    quarantineDurationMs = DEFAULT_QUARANTINE_DURATION_MS,
    rollingWindowSize = DEFAULT_ROLLING_WINDOW,
  ) {
    this.quarantineThreshold = quarantineThreshold
    this.quarantineDurationMs = quarantineDurationMs
    this.rollingWindowSize = rollingWindowSize
  }

  record(result: ProbeResult): NodeHealthSnapshot {
    let state = this.nodes.get(result.id)
    if (!state) {
      state = {
        id: result.id,
        consecutiveFailures: 0,
        rttSamples: [],
        quarantinedUntil: null,
        lastProbed: null,
      }
      this.nodes.set(result.id, state)
    }

    state.lastProbed = result.timestamp

    if (result.success && result.latencyMs !== null) {
      state.consecutiveFailures = 0
      state.rttSamples.push(result.latencyMs)
      if (state.rttSamples.length > this.rollingWindowSize) {
        state.rttSamples.shift()
      }
      // Successful probe lifts quarantine
      if (state.quarantinedUntil !== null && result.timestamp > state.quarantinedUntil) {
        state.quarantinedUntil = null
      }
    } else {
      state.consecutiveFailures++
      if (state.consecutiveFailures >= this.quarantineThreshold) {
        state.quarantinedUntil = Date.now() + this.quarantineDurationMs
      }
    }

    return this.snapshot(state)
  }

  get(id: string): NodeHealthSnapshot | null {
    const state = this.nodes.get(id)
    return state ? this.snapshot(state) : null
  }

  getAll(): NodeHealthSnapshot[] {
    return [...this.nodes.values()].map(s => this.snapshot(s))
  }

  isQuarantined(id: string): boolean {
    const state = this.nodes.get(id)
    if (!state?.quarantinedUntil) return false
    return Date.now() < state.quarantinedUntil
  }

  quarantinedCount(): number {
    const now = Date.now()
    return [...this.nodes.values()].filter(
      s => s.quarantinedUntil !== null && now < s.quarantinedUntil
    ).length
  }

  // Returns the best (lowest RTT) non-quarantined node ID, or null
  bestNode(): string | null {
    const now = Date.now()
    let best: { id: string; rtt: number } | null = null

    for (const state of this.nodes.values()) {
      if (state.quarantinedUntil !== null && now < state.quarantinedUntil) continue
      if (state.rttSamples.length === 0) continue
      const rtt = average(state.rttSamples)
      if (best === null || rtt < best.rtt) {
        best = { id: state.id, rtt }
      }
    }

    return best?.id ?? null
  }

  clear(): void {
    this.nodes.clear()
  }

  private snapshot(state: NodeState): NodeHealthSnapshot {
    const rollingRttMs = state.rttSamples.length > 0 ? average(state.rttSamples) : null
    const score = this.computeScore(state, rollingRttMs)

    return {
      id: state.id,
      consecutiveFailures: state.consecutiveFailures,
      rollingRttMs,
      quarantinedUntil: state.quarantinedUntil,
      lastProbed: state.lastProbed,
      score,
    }
  }

  private computeScore(state: NodeState, rollingRttMs: number | null): number {
    if (state.quarantinedUntil !== null && Date.now() < state.quarantinedUntil) return 0
    if (rollingRttMs === null) return 50  // unknown — neutral

    // Latency score: 100 at 0ms, ~0 at 2000ms
    const latencyScore = Math.max(0, 100 - (rollingRttMs / 20))

    // Reliability penalty: -10 per consecutive failure
    const reliabilityPenalty = state.consecutiveFailures * 10

    return Math.round(Math.max(0, Math.min(100, latencyScore - reliabilityPenalty)))
  }
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
