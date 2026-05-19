import { NodeProber } from './NodeProber'
import { NodeHealthTracker } from './NodeHealthTracker'
import type { ProbeTarget, ProbeResult, ProbeSchedulerOptions, NodeHealthSnapshot } from './types'

type LatencyApiFn = (tag: string, url: string, timeoutMs: number) => Promise<number | null>

const PROBE_URL = 'http://www.gstatic.com/generate_204'
const DEFAULT_CONCURRENCY = 10
const DEFAULT_TIMEOUT_MS = 5000

export class ProbeScheduler {
  private readonly concurrency: number
  private readonly timeoutMs: number
  private readonly tcpProber: NodeProber
  private readonly tracker: NodeHealthTracker
  private running = false

  constructor(opts: ProbeSchedulerOptions = {}) {
    this.concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY
    this.timeoutMs = opts.probeTimeoutMs ?? DEFAULT_TIMEOUT_MS
    this.tcpProber = new NodeProber(this.timeoutMs)
    this.tracker = new NodeHealthTracker(
      opts.quarantineThreshold,
      opts.quarantineDurationMs,
      opts.rollingWindowSize,
    )
  }

  // Probe using Mihomo engine API (preferred when engine is running).
  // latencyApiFn: calls GET /proxies/{tag}/delay — provided by caller to avoid coupling.
  async probeViaEngine(
    tags: string[],
    latencyApiFn: LatencyApiFn,
    onResult?: (result: ProbeResult, snapshot: NodeHealthSnapshot) => void,
  ): Promise<ProbeResult[]> {
    return this.runBatch(tags, async (tag) => {
      const ms = await latencyApiFn(tag, PROBE_URL, this.timeoutMs).catch(() => null)
      const result: ProbeResult = {
        id: tag,
        latencyMs: ms,
        success: ms !== null && ms > 0,
        timestamp: Date.now(),
        ...(ms === null ? { failureReason: 'timeout' as const } : {}),
      }
      return result
    }, onResult)
  }

  // Probe via direct TCP connect — works offline, less accurate (no protocol overhead).
  async probeViaTcp(
    targets: ProbeTarget[],
    onResult?: (result: ProbeResult, snapshot: NodeHealthSnapshot) => void,
  ): Promise<ProbeResult[]> {
    return this.runBatch(targets, async (target) => {
      return this.tcpProber.probe(target)
    }, onResult)
  }

  getHealth(id: string): NodeHealthSnapshot | null {
    return this.tracker.get(id)
  }

  getAllHealth(): NodeHealthSnapshot[] {
    return this.tracker.getAll()
  }

  quarantinedCount(): number {
    return this.tracker.quarantinedCount()
  }

  bestNode(): string | null {
    return this.tracker.bestNode()
  }

  clear(): void {
    this.tracker.clear()
  }

  private async runBatch<T>(
    items: T[],
    probe: (item: T) => Promise<ProbeResult>,
    onResult?: (result: ProbeResult, snapshot: NodeHealthSnapshot) => void,
  ): Promise<ProbeResult[]> {
    if (this.running) return []
    this.running = true

    try {
      const results: ProbeResult[] = []
      let index = 0
      let active = 0

      if (items.length === 0) return []

      await new Promise<void>((resolveAll) => {
        const next = (): void => {
          while (active < this.concurrency && index < items.length) {
            const item = items[index++]!
            active++
            probe(item)
              .catch((): ProbeResult => ({
                id: typeof item === 'string' ? item : (item as unknown as ProbeTarget).id,
                latencyMs: null,
                success: false,
                timestamp: Date.now(),
                failureReason: 'unknown',
              }))
              .then(result => {
                const snapshot = this.tracker.record(result)
                results.push(result)
                onResult?.(result, snapshot)
                active--
                if (results.length === items.length) {
                  resolveAll()
                } else {
                  next()
                }
              })
          }
        }
        next()
      })

      return results
    } finally {
      this.running = false
    }
  }
}
