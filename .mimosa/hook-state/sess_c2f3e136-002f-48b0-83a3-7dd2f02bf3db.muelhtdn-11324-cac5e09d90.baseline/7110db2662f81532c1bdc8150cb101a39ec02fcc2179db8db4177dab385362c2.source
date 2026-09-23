import { getSubscriptionStore } from './SubscriptionStore'
import { getSubscriptionAggregator } from './SubscriptionAggregatorService'
import { getLogger } from '../logger'
import { sendToRenderer } from '../window'
import { IpcChannel } from '../../shared/ipc/channels'
import { services } from '../ipc/registry'
import type { SubscriptionEntry } from '../../shared/ipc/types'
import type { RuntimeService } from './RuntimeService'

interface ScheduledJob {
  entryId: string
  intervalMinutes: number
  timer: NodeJS.Timeout
  nextFireAt: number
}

// Stagger window — first fires are offset within this many ms to avoid bursts.
const STAGGER_WINDOW_MS = 30_000
const MINUTE_MS = 60_000

/**
 * SubscriptionScheduler — fires per-entry refresh on the user-configured interval.
 *
 * Rules:
 *  - autoUpdateMinutes === 0 → no schedule
 *  - Entries get a staggered first fire so we don't burst N requests on app start
 *  - On settings change (or subscriptions list change) call reconcile()
 *  - Emits EVENT_SUBSCRIPTIONS_CHANGED after each successful refresh
 *  - Failures are logged but don't tear down the schedule
 */
export class SubscriptionScheduler {
  private readonly jobs = new Map<string, ScheduledJob>()
  private started = false

  start(): void {
    if (this.started) return
    this.started = true
    this.reconcile()
    getLogger().info({ count: this.jobs.size }, 'SubscriptionScheduler started')
  }

  stop(): void {
    for (const job of this.jobs.values()) clearTimeout(job.timer)
    this.jobs.clear()
    this.started = false
  }

  // Compare desired vs. running jobs and update accordingly. Cheap — safe to call
  // after any mutation (add/remove/update entry).
  reconcile(): void {
    if (!this.started) return

    const desired = new Map<string, SubscriptionEntry>()
    for (const e of getSubscriptionStore().list()) {
      if (e.enabled && e.autoUpdateMinutes > 0) {
        desired.set(e.id, e)
      }
    }

    // Cancel jobs that are no longer wanted or have a different interval
    for (const [id, job] of this.jobs) {
      const next = desired.get(id)
      if (!next || next.autoUpdateMinutes !== job.intervalMinutes) {
        clearTimeout(job.timer)
        this.jobs.delete(id)
      }
    }

    // Schedule newly desired
    let staggerIdx = 0
    for (const [id, entry] of desired) {
      if (this.jobs.has(id)) continue
      this.scheduleJob(entry, staggerIdx++)
    }
  }

  private scheduleJob(entry: SubscriptionEntry, staggerIdx: number): void {
    const intervalMs = entry.autoUpdateMinutes * MINUTE_MS
    // First fire: 30s + staggered offset (so 5 entries don't fire at the same second)
    const offset = STAGGER_WINDOW_MS + ((staggerIdx * 4_000) % STAGGER_WINDOW_MS)
    const firstDelay = Math.min(offset, intervalMs)
    const nextFireAt = Date.now() + firstDelay

    const timer = setTimeout(() => void this.runJob(entry.id), firstDelay)
    this.jobs.set(entry.id, {
      entryId: entry.id,
      intervalMinutes: entry.autoUpdateMinutes,
      timer,
      nextFireAt,
    })
  }

  private async runJob(entryId: string): Promise<void> {
    const log = getLogger()
    const entry = getSubscriptionStore().getById(entryId)

    // If the entry vanished or got disabled — drop the job (reconcile would also catch this on next change)
    if (!entry || !entry.enabled || entry.autoUpdateMinutes === 0) {
      const existing = this.jobs.get(entryId)
      if (existing) {
        clearTimeout(existing.timer)
        this.jobs.delete(entryId)
      }
      return
    }

    try {
      await getSubscriptionAggregator().refreshOne(entryId)
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, getSubscriptionStore().list())
      // Hot-reload if engine is running
      try {
        if (services.has('runtime')) {
          const runtime = services.resolve<RuntimeService>('runtime')
          void runtime.notifySubscriptionsChanged()
        }
      } catch {
        // Non-fatal
      }
      log.info({ entryId, name: entry.name }, 'Scheduled subscription refresh succeeded')
    } catch (err) {
      log.warn({ entryId, err }, 'Scheduled subscription refresh failed')
    }

    // Re-arm the timer for the next interval. Read interval again — the user
    // may have edited it while we were running.
    const fresh = getSubscriptionStore().getById(entryId)
    if (!fresh || !fresh.enabled || fresh.autoUpdateMinutes === 0) {
      this.jobs.delete(entryId)
      return
    }

    const intervalMs = fresh.autoUpdateMinutes * MINUTE_MS
    const timer = setTimeout(() => void this.runJob(entryId), intervalMs)
    this.jobs.set(entryId, {
      entryId,
      intervalMinutes: fresh.autoUpdateMinutes,
      timer,
      nextFireAt: Date.now() + intervalMs,
    })
  }

  // Diagnostic: list scheduled jobs with their nextFireAt timestamps.
  describe(): Array<{ entryId: string; intervalMinutes: number; nextFireAt: number }> {
    return [...this.jobs.values()].map(j => ({
      entryId: j.entryId,
      intervalMinutes: j.intervalMinutes,
      nextFireAt: j.nextFireAt,
    }))
  }
}

let _instance: SubscriptionScheduler | null = null
export function getSubscriptionScheduler(): SubscriptionScheduler {
  if (!_instance) _instance = new SubscriptionScheduler()
  return _instance
}
