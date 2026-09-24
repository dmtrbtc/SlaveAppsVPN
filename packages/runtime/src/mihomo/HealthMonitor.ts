import http from 'http'
import dns from 'dns/promises'
import { EMPTY_HEALTH, type HealthStatus } from '../state/RuntimeState'
import type { EngineEventBus } from '../engine/EngineEvents'
import type { MihomoApiClient } from './MihomoApiClient'
import type { TunHooks } from '../engine/VPNEngine.interface'

const DNS_CHECK_HOSTNAME = 'dns.google'
const CONNECTIVITY_TIMEOUT_MS = 3_000
const TRAFFIC_ACTIVE_WINDOW_MS = 30_000
const STARTUP_RETRY_MS = 1_000
const STARTUP_RETRY_WINDOW_MS = 60_000
const CONNECTIVITY_CHECK_URLS = [
  'http://connectivitycheck.gstatic.com/generate_204',
  'http://cp.cloudflare.com/generate_204',
] as const

export interface HealthMonitorConfig {
  mixedPort: number
  tunHooks?: TunHooks
}

export class HealthMonitor {
  private timer: NodeJS.Timeout | null = null
  private current: HealthStatus = { ...EMPTY_HEALTH }
  private config: HealthMonitorConfig | null = null
  private lastTrafficSeen = 0
  private retryTimer: NodeJS.Timeout | null = null
  private startupRetryDeadline = 0
  private generation = 0
  private readonly activeChecks = new Set<number>()

  constructor(
    private readonly isProcessAlive: () => boolean,
    private readonly api: MihomoApiClient,
    private readonly events: EngineEventBus,
    private readonly intervalMs: number
  ) {}

  configure(config: HealthMonitorConfig): void {
    this.config = config
  }

  start(): void {
    if (this.timer) return
    const generation = ++this.generation
    this.startupRetryDeadline = Date.now() + STARTUP_RETRY_WINDOW_MS
    void this.runChecks(generation)
    this.timer = setInterval(() => void this.runChecks(generation), this.intervalMs)
  }

  stop(): void {
    ++this.generation
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.startupRetryDeadline = 0
    this.current = { ...EMPTY_HEALTH }
    this.lastTrafficSeen = 0
  }

  getHealth(): HealthStatus {
    return { ...this.current }
  }

  notifyTrafficSeen(): void {
    this.lastTrafficSeen = Date.now()
    // Real traffic after an early failed probe is a good reason to refresh the
    // verdict immediately instead of leaving the UI stale until the 30s tick.
    if (!this.current.connectivityOk && this.timer && !this.retryTimer) {
      const generation = this.generation
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null
        void this.runChecks(generation)
      }, 250)
    }
  }

  isHealthy(): boolean {
    return this.current.processAlive && this.current.apiResponding
  }

  private async runChecks(generation = this.generation): Promise<void> {
    if (this.activeChecks.has(generation)) return
    this.activeChecks.add(generation)
    try {
      const [apiResponding, connectivityOk, tunAvailable] = await Promise.all([
        this.checkApi(),
        this.checkConnectivity(),
        this.checkTun(),
      ])
      // Avoid a redundant c-ares query when the hostname-based request already
      // proved DNS. Apart from producing weaker evidence, competing encrypted DNS
      // resolvers may log cancellation of the losing request as a warning.
      const dnsProbeOk = connectivityOk ? true : await this.checkDns()

      const next: HealthStatus = {
        processAlive: this.isProcessAlive(),
        apiResponding,
        connectivityOk,
        // The connectivity request uses a hostname through Mihomo's local HTTP
        // proxy. A successful response therefore proves that the active runtime
        // DNS path resolved that hostname. Node's independent c-ares resolver can
        // transiently fail while Windows/TUN routes are settling and must not
        // override that stronger end-to-end evidence.
        dnsOk: connectivityOk || dnsProbeOk,
        trafficActive:
          this.lastTrafficSeen > 0 &&
          Date.now() - this.lastTrafficSeen < TRAFFIC_ACTIVE_WINDOW_MS,
        tunAvailable,
        checkedAt: Date.now(),
      }

      if (generation !== this.generation) return
      const changed = this.hasChanged(this.current, next)
      this.current = next

      if (changed) {
        this.events.emit('healthChanged', { health: next })
      }
      if (connectivityOk) {
        this.startupRetryDeadline = 0
      } else if (Date.now() < this.startupRetryDeadline && !this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          void this.runChecks(generation)
        }, STARTUP_RETRY_MS)
      }
    } finally {
      this.activeChecks.delete(generation)
    }
  }

  private async checkApi(): Promise<boolean> {
    try {
      return await this.api.isAlive()
    } catch {
      return false
    }
  }

  private async checkConnectivity(): Promise<boolean> {
    if (!this.config) return Promise.resolve(false)
    for (const url of CONNECTIVITY_CHECK_URLS) {
      if (await this.checkConnectivityUrl(url)) return true
    }
    return false
  }

  private checkConnectivityUrl(url: string): Promise<boolean> {
    const { mixedPort } = this.config!
    const parsed = new URL(url)

    return new Promise((resolve) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: mixedPort,
          // Full URL as path — HTTP proxy protocol format
          path: url,
          method: 'GET',
          headers: { Host: parsed.host },
          timeout: CONNECTIVITY_TIMEOUT_MS,
        },
        (res) => {
          resolve(res.statusCode === 204 || res.statusCode === 200)
          res.resume()
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    })
  }

  private async checkDns(): Promise<boolean> {
    try {
      await dns.resolve4(DNS_CHECK_HOSTNAME)
      return true
    } catch {
      return false
    }
  }

  private async checkTun(): Promise<boolean> {
    if (!this.config?.tunHooks) return true
    try {
      return await this.config.tunHooks.checkTunAvailability()
    } catch {
      return false
    }
  }

  private hasChanged(prev: HealthStatus, next: HealthStatus): boolean {
    return (
      prev.processAlive !== next.processAlive ||
      prev.apiResponding !== next.apiResponding ||
      prev.connectivityOk !== next.connectivityOk ||
      prev.dnsOk !== next.dnsOk ||
      prev.trafficActive !== next.trafficActive ||
      prev.tunAvailable !== next.tunAvailable
    )
  }
}
