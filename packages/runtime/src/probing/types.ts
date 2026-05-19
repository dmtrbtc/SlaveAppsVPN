export type ProbeFailureReason = 'timeout' | 'refused' | 'unreachable' | 'unknown'

export interface ProbeTarget {
  id: string        // unique identifier (proxy name or id)
  server: string
  port: number
}

export interface ProbeResult {
  id: string
  latencyMs: number | null
  success: boolean
  timestamp: number
  failureReason?: ProbeFailureReason
}

export interface NodeHealthSnapshot {
  id: string
  consecutiveFailures: number
  rollingRttMs: number | null     // average of last N successful probes
  quarantinedUntil: number | null // epoch ms, null if not quarantined
  lastProbed: number | null       // epoch ms
  score: number                   // 0-100, higher is better
}

export interface ProbeSchedulerOptions {
  concurrency?: number            // max parallel probes (default: 5)
  probeTimeoutMs?: number         // per-probe timeout (default: 3000)
  quarantineThreshold?: number    // consecutive failures before quarantine (default: 3)
  quarantineDurationMs?: number   // how long to quarantine (default: 5 * 60000)
  rollingWindowSize?: number      // samples for rolling RTT (default: 5)
}
