import type { Server, ServerAvailability } from '@slave-vpn/shared'

/** Per-node health derived from probe telemetry (mirrors ServerLatencyPayload). */
export interface NodeHealth {
  score: number
  consecutiveFailures: number
  quarantined: boolean
}

/**
 * Live availability from probe telemetry, falling back to the static field
 * when there is no telemetry yet. Quarantine wins (the node failed enough
 * consecutive probes to be benched), then a failure streak of 2+ or a health
 * score below 50 marks the node as unstable instead of silently showing the
 * last known-good state.
 */
export function effectiveAvailability(server: Server, health?: NodeHealth): ServerAvailability {
  if (!health) return server.availability
  if (health.quarantined) return 'offline'
  if (health.consecutiveFailures >= 2 || health.score < 50) return 'degraded'
  return server.availability
}
