import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getLogger } from '../logger'

interface LaunchRecord {
  count: number
  lastLaunch: number
  safeMode: boolean
  healthy: boolean
}

const CRASH_THRESHOLD = 3
const CRASH_WINDOW_MS = 45_000
const HEALTHY_UPTIME_MS = 60_000

const DEFAULT_RECORD: LaunchRecord = { count: 0, lastLaunch: 0, safeMode: false, healthy: true }

export class SafeModeManager {
  private readonly filePath: string
  private record: LaunchRecord
  private healthyTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.filePath = join(app.getPath('userData'), 'launch-record.json')
    this.record = this.load()
  }

  /** Call at very start of main process, before bootstrap. */
  init(): void {
    const now = Date.now()
    const sinceLast = now - this.record.lastLaunch
    const log = getLogger()

    if (!this.record.healthy && sinceLast < CRASH_WINDOW_MS) {
      this.record.count++
      log.warn({ count: this.record.count, sinceLast }, 'SafeMode: detected rapid relaunch')
    } else {
      this.record.count = 1
    }

    this.record.lastLaunch = now
    this.record.healthy = false

    if (this.record.count >= CRASH_THRESHOLD && !this.record.safeMode) {
      this.record.safeMode = true
      log.error({ count: this.record.count }, 'SafeMode: entering safe mode due to crash loop')
    }

    this.persist()
  }

  /** Call after successful bootstrap. Schedules healthy-mark after HEALTHY_UPTIME_MS. */
  scheduleHealthyMark(): void {
    this.healthyTimer = setTimeout(() => {
      this.markHealthy()
    }, HEALTHY_UPTIME_MS)
  }

  markHealthy(): void {
    this.record.healthy = true
    this.record.count = 0
    if (this.record.safeMode) {
      getLogger().info('SafeMode: exiting safe mode — session healthy')
      this.record.safeMode = false
    }
    this.persist()
  }

  isSafeMode(): boolean {
    return this.record.safeMode
  }

  getLaunchCount(): number {
    return this.record.count
  }

  /** User-triggered reset from UI. */
  resetSafeMode(): void {
    this.record = { ...DEFAULT_RECORD }
    this.persist()
    getLogger().info('SafeMode: manually reset by user')
  }

  dispose(): void {
    if (this.healthyTimer !== null) {
      clearTimeout(this.healthyTimer)
      this.healthyTimer = null
    }
  }

  private load(): LaunchRecord {
    if (!existsSync(this.filePath)) return { ...DEFAULT_RECORD }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return { ...DEFAULT_RECORD, ...(JSON.parse(raw) as Partial<LaunchRecord>) }
    } catch {
      return { ...DEFAULT_RECORD }
    }
  }

  private persist(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.record, null, 2), 'utf-8')
    } catch {/* ignore write errors on shutdown */ }
  }
}

let _instance: SafeModeManager | null = null

export function getSafeModeManager(): SafeModeManager {
  if (!_instance) _instance = new SafeModeManager()
  return _instance
}
