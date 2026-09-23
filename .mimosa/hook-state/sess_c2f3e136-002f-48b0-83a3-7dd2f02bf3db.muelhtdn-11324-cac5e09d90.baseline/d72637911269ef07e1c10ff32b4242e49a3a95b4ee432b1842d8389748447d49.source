import { getLogger } from '../logger'
import { IpcChannel } from '../../shared/ipc/channels'
import { sendToRenderer } from '../window'

interface NodeRecord {
  failures: number
  lastFailure: number
  quarantinedUntil: number
  errorKinds: string[]
}

const FAILURE_THRESHOLD = 3
const BASE_QUARANTINE_MS = 30_000  // 30 seconds
const MAX_QUARANTINE_MS = 5 * 60_000  // 5 minutes
const RECORD_TTL_MS = 10 * 60_000  // forget records older than 10 minutes

export class NodeHealthManager {
  private readonly records = new Map<string, NodeRecord>()
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    // Periodic cleanup of stale records
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000)
  }

  recordFailure(nodeName: string, errorKind: string): void {
    const now = Date.now()
    const existing = this.records.get(nodeName)

    const record: NodeRecord = existing ?? {
      failures: 0,
      lastFailure: now,
      quarantinedUntil: 0,
      errorKinds: [],
    }

    record.failures++
    record.lastFailure = now
    if (!record.errorKinds.includes(errorKind)) {
      record.errorKinds.push(errorKind)
    }

    if (record.failures >= FAILURE_THRESHOLD && record.quarantinedUntil < now) {
      const quarantineMs = Math.min(
        BASE_QUARANTINE_MS * Math.pow(2, record.failures - FAILURE_THRESHOLD),
        MAX_QUARANTINE_MS
      )
      record.quarantinedUntil = now + quarantineMs
      const log = getLogger()
      log.warn(
        { node: nodeName, failures: record.failures, quarantineMs, errorKinds: record.errorKinds },
        'NodeHealth: quarantining node'
      )
      sendToRenderer(IpcChannel.EVENT_RUNTIME_EVENT, {
        id: crypto.randomUUID(),
        kind: 'proxy.reality_error',
        severity: 'warning',
        timestamp: now,
        message: `Узел ${nodeName} помещён в карантин на ${Math.round(quarantineMs / 1000)}с (${record.failures} ошибок)`,
        metadata: { node: nodeName, failures: record.failures, errorKind },
      })
    }

    this.records.set(nodeName, record)
  }

  recordSuccess(nodeName: string): void {
    const record = this.records.get(nodeName)
    if (!record) return
    record.failures = Math.max(0, record.failures - 1)
    record.quarantinedUntil = 0
    if (record.failures === 0) {
      this.records.delete(nodeName)
    } else {
      this.records.set(nodeName, record)
    }
  }

  isQuarantined(nodeName: string): boolean {
    const record = this.records.get(nodeName)
    if (!record) return false
    return record.quarantinedUntil > Date.now()
  }

  getQuarantinedNodes(): string[] {
    const now = Date.now()
    return [...this.records.entries()]
      .filter(([, r]) => r.quarantinedUntil > now)
      .map(([name]) => name)
  }

  getHealthSummary(): { total: number; quarantined: number; degraded: number } {
    const now = Date.now()
    let quarantined = 0
    let degraded = 0
    for (const r of this.records.values()) {
      if (r.quarantinedUntil > now) quarantined++
      else if (r.failures > 0) degraded++
    }
    return { total: this.records.size, quarantined, degraded }
  }

  private cleanup(): void {
    const cutoff = Date.now() - RECORD_TTL_MS
    for (const [name, record] of this.records) {
      if (record.lastFailure < cutoff && record.quarantinedUntil < Date.now()) {
        this.records.delete(name)
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer)
    this.records.clear()
  }
}

let _instance: NodeHealthManager | null = null

export function getNodeHealthManager(): NodeHealthManager {
  if (!_instance) _instance = new NodeHealthManager()
  return _instance
}
