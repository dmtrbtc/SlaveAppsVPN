import http from 'http'
import dns from 'dns/promises'
import { EMPTY_HEALTH, type HealthStatus } from '../state/RuntimeState'
import type { EngineEventBus } from '../engine/EngineEvents'
import type { MihomoApiClient } from './MihomoApiClient'
import type { TunHooks } from '../engine/VPNEngine.interface'

const DNS_CHECK_HOSTNAME = 'dns.google'
const CONNECTIVITY_TIMEOUT_MS = 5_000
const TRAFFIC_ACTIVE_WINDOW_MS = 30_000

export interface HealthMonitorConfig {
  mixedPort: number
  tunHooks?: TunHooks
}

export class HealthMonitor {
  private timer: NodeJS.Timeout | null = null
  private current: HealthStatus = { ...EMPTY_HEALTH }
  private config: HealthMonitorConfig | null = null
  private lastTrafficSeen = 0

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
    void this.runChecks()
    this.timer = setInterval(() => void this.runChecks(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.current = { ...EMPTY_HEALTH }
    this.lastTrafficSeen = 0
  }

  getHealth(): HealthStatus {
    return { ...this.current }
  }

  notifyTrafficSeen(): void {
    this.lastTrafficSeen = Date.now()
  }

  isHealthy(): boolean {
    return this.current.processAlive && this.current.apiResponding
  }

  private async runChecks(): Promise<void> {
    const [apiResponding, connectivityOk, dnsOk, tunAvailable] = await Promise.all([
      this.checkApi(),
      this.checkConnectivity(),
      this.checkDns(),
      this.checkTun(),
    ])

    const next: HealthStatus = {
      processAlive: this.isProcessAlive(),
      apiResponding,
      connectivityOk,
      dnsOk,
      trafficActive:
        this.lastTrafficSeen > 0 &&
        Date.now() - this.lastTrafficSeen < TRAFFIC_ACTIVE_WINDOW_MS,
      tunAvailable,
      checkedAt: Date.now(),
    }

    const changed = this.hasChanged(this.current, next)
    this.current = next

    if (changed) {
      this.events.emit('healthChanged', { health: next })
    }
  }

  private async checkApi(): Promise<boolean> {
    try {
      return await this.api.isAlive()
    } catch {
      return false
    }
  }

  private checkConnectivity(): Promise<boolean> {
    if (!this.config) return Promise.resolve(false)
    const { mixedPort } = this.config

    return new Promise((resolve) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: mixedPort,
          // Full URL as path — HTTP proxy protocol format
          path: 'http://connectivitycheck.gstatic.com/generate_204',
          method: 'GET',
          headers: { Host: 'connectivitycheck.gstatic.com' },
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
