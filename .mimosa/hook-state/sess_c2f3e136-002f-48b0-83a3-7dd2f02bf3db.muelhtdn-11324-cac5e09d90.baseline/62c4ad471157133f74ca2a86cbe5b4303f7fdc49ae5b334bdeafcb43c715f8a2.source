import { EMPTY_TRAFFIC_STATS, type TrafficStats } from '@slave-vpn/shared'
import type { EngineEventBus } from '../engine/EngineEvents'
import type { MihomoApiClient, MihomoTrafficSnapshot } from './MihomoApiClient'

export class TrafficMonitor {
  private stats: TrafficStats = { ...EMPTY_TRAFFIC_STATS }
  private stopStream: (() => void) | null = null
  private sessionStartedAt: number | null = null
  private onTrafficSeen: (() => void) | null = null

  constructor(
    private readonly api: MihomoApiClient,
    private readonly events: EngineEventBus
  ) {}

  start(onTrafficSeen?: () => void): void {
    if (this.stopStream) return
    this.onTrafficSeen = onTrafficSeen ?? null
    this.sessionStartedAt = Date.now()
    this.stats = { ...EMPTY_TRAFFIC_STATS, sessionStartedAt: this.sessionStartedAt }

    this.stopStream = this.api.streamTraffic(
      (snapshot) => this.handleSnapshot(snapshot),
      (_err) => { /* stream auto-reconnects internally */ }
    )
  }

  stop(): void {
    this.stopStream?.()
    this.stopStream = null
    this.stats = { ...EMPTY_TRAFFIC_STATS }
    this.sessionStartedAt = null
    this.onTrafficSeen = null
  }

  getStats(): TrafficStats {
    return { ...this.stats }
  }

  private handleSnapshot(snapshot: MihomoTrafficSnapshot): void {
    const { up, down } = snapshot

    this.stats = {
      uploadBytes: this.stats.uploadBytes + up,
      downloadBytes: this.stats.downloadBytes + down,
      uploadSpeedBps: up,
      downloadSpeedBps: down,
      sessionUploadBytes: this.stats.sessionUploadBytes + up,
      sessionDownloadBytes: this.stats.sessionDownloadBytes + down,
      sessionStartedAt: this.sessionStartedAt,
    }

    if (up > 0 || down > 0) {
      this.onTrafficSeen?.()
    }

    this.events.emit('trafficUpdate', { stats: this.stats })
  }
}
