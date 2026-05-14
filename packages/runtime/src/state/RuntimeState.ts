export type RuntimeState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'reconnecting'
  | 'error'

export type StopReason =
  | 'intentional'
  | 'crashed'
  | 'config_reload'
  | 'update_restart'
  | 'sleep_recovery'
  | 'health_failure'

export type HotReloadType =
  | 'hot'           // PATCH /configs — no disconnect
  | 'reconnect'     // PUT /configs + reconnect (proxy changed)
  | 'full_restart'  // kill + restart (TUN/ports changed)

export type RestartReason = Exclude<StopReason, 'intentional' | 'crashed'>

export interface RuntimeStateTransition {
  from: RuntimeState
  to: RuntimeState
  reason?: string
  timestamp: number
}

export interface HealthStatus {
  processAlive: boolean
  apiResponding: boolean
  connectivityOk: boolean
  dnsOk: boolean
  trafficActive: boolean
  tunAvailable: boolean
  checkedAt: number
}

export const EMPTY_HEALTH: HealthStatus = {
  processAlive: false,
  apiResponding: false,
  connectivityOk: false,
  dnsOk: false,
  trafficActive: false,
  tunAvailable: false,
  checkedAt: 0,
}
