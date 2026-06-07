import type { EngineEventBus } from '../engine/EngineEvents'
import type { BalancerMode, NodeScore, BalancerState } from './types'

export type { BalancerMode, NodeScore, BalancerState }

// Abstraction for latency probing — decoupled from NodeProber's TCP-specific implementation
export interface LatencyProber {
  probe(proxyName: string, url: string, timeoutMs: number): Promise<number | null>
}

const PROBE_URL = 'http://www.gstatic.com/generate_204'
const DEFAULT_PROBE_INTERVAL_MS = 60_000  // 1 min when active
const JITTER_WINDOW = 5                   // last N probes for jitter calc

interface ProbeHistory {
  latencies: (number | null)[]
  lastAt: number
}

export class NodeBalancer {
  private enabled = false
  private mode: BalancerMode = 'balanced'
  private history: Map<string, ProbeHistory> = new Map()
  private timer: ReturnType<typeof setInterval> | null = null
  private currentBest: string | null = null
  private lastRebalanceAt: number | null = null
  private _onSelect: ((name: string) => void) | null = null

  constructor(
    private readonly prober: LatencyProber,
    _events: EngineEventBus | null,
  ) {
    void _events
  }

  configure(opts: { enabled?: boolean; mode?: BalancerMode }): void {
    if (opts.enabled !== undefined) this.enabled = opts.enabled
    if (opts.mode !== undefined) this.mode = opts.mode
  }

  onSelect(fn: (name: string) => void): void {
    this._onSelect = fn
  }

  start(proxyNames: string[]): void {
    this.stop()
    if (!this.enabled || proxyNames.length === 0) return
    // Initialize history for all known proxies
    for (const name of proxyNames) {
      if (!this.history.has(name)) {
        this.history.set(name, { latencies: [], lastAt: 0 })
      }
    }
    this.timer = setInterval(
      () => void this.runProbeRound(proxyNames),
      DEFAULT_PROBE_INTERVAL_MS,
    )
    // Immediate first probe
    void this.runProbeRound(proxyNames)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getState(): BalancerState {
    return {
      enabled: this.enabled,
      mode: this.mode,
      currentBest: this.currentBest,
      lastRebalanceAt: this.lastRebalanceAt,
      probeIntervalMs: DEFAULT_PROBE_INTERVAL_MS,
      nodes: this.computeScores(),
    }
  }

  async probeAll(proxyNames: string[]): Promise<void> {
    await this.runProbeRound(proxyNames)
  }

  private async runProbeRound(proxyNames: string[]): Promise<void> {
    const results = await Promise.allSettled(
      proxyNames.map(name =>
        this.prober.probe(name, PROBE_URL, 5_000).then(latency => ({ name, latency }))
      )
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { name, latency } = r.value
        const hist = this.history.get(name) ?? { latencies: [], lastAt: 0 }
        hist.latencies = [...hist.latencies.slice(-(JITTER_WINDOW - 1)), latency]
        hist.lastAt = Date.now()
        this.history.set(name, hist)
      }
    }

    if (this.enabled) {
      this.rebalance(proxyNames)
    }
  }

  private rebalance(proxyNames: string[]): void {
    const scores = this.computeScores().filter(s => proxyNames.includes(s.name))
    if (scores.length === 0) return

    const available = scores.filter((s): s is NodeScore & { latencyMs: number } =>
      !s.quarantined && s.latencyMs !== null
    )
    if (available.length === 0) return

    let best: NodeScore
    switch (this.mode) {
      case 'latency':
        best = available.reduce((a, b) => (a.latencyMs < b.latencyMs ? a : b))
        break
      case 'stability':
        best = available.reduce((a, b) => (a.stabilityScore > b.stabilityScore ? a : b))
        break
      case 'balanced':
      default:
        best = available.reduce((a, b) => (a.compositeScore > b.compositeScore ? a : b))
        break
    }

    if (best.name !== this.currentBest) {
      this.currentBest = best.name
      this.lastRebalanceAt = Date.now()
      this._onSelect?.(best.name)
    }
  }

  private computeScores(): NodeScore[] {
    const out: NodeScore[] = []
    for (const [name, hist] of this.history.entries()) {
      const latencies = hist.latencies.filter((l): l is number => l !== null)
      const lastLatency = latencies[latencies.length - 1]
      const latencyMs: number | null = lastLatency !== undefined ? lastLatency : null

      // Jitter = stddev of latency samples
      const avg = latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0
      const jitter = latencies.length > 1
        ? Math.sqrt(latencies.map(l => (l - avg) ** 2).reduce((a, b) => a + b, 0) / latencies.length)
        : 0

      // Packet loss = fraction of null results
      const packetLoss = hist.latencies.length > 0
        ? hist.latencies.filter(l => l === null).length / hist.latencies.length
        : 0

      // Stability: lower jitter + lower loss = higher stability
      const stabilityScore = Math.max(0, 100 - jitter * 0.5 - packetLoss * 100)

      // Composite score (balanced mode): latency contributes inversely, stability directly
      const latencyPenalty = latencyMs !== null ? Math.min(latencyMs / 10, 50) : 50
      const compositeScore = Math.max(0, 100 - latencyPenalty + stabilityScore * 0.5 - packetLoss * 50)

      out.push({
        name,
        latencyMs,
        jitterMs: Math.round(jitter),
        packetLoss,
        stabilityScore: Math.round(stabilityScore),
        compositeScore: Math.round(compositeScore),
        probeCount: hist.latencies.length,
        lastProbeAt: hist.lastAt > 0 ? hist.lastAt : null,
        quarantined: false,
      })
    }
    return out.sort((a, b) => b.compositeScore - a.compositeScore)
  }
}
