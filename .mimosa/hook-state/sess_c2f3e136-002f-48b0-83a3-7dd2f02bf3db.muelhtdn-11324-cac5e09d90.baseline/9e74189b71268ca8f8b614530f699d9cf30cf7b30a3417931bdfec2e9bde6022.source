import type { VpnHealthPayload } from '@shared/ipc/types'

export type ConnectionHealthState =
  | 'healthy'
  | 'degraded'
  | 'dns_failure'
  | 'tunnel_unstable'
  | 'provider_unreachable'
  | 'offline'

export type QualityTier = 'excellent' | 'good' | 'fair' | 'poor'

export interface ConnectionHealth {
  state: ConnectionHealthState
  score: number
  dnsOk: boolean
  connectivityOk: boolean
  tunAvailable: boolean
  apiResponding: boolean
  trafficActive: boolean
  checkedAt: number
}

// Weights reflect user-visible impact severity.
// processAlive+apiResponding = engine functioning
// connectivityOk+dnsOk = user can browse
// tunAvailable = full traffic capture
// trafficActive = confirming active data flow
function computeScore(h: VpnHealthPayload): number {
  return (
    (h.processAlive ? 20 : 0) +
    (h.apiResponding ? 20 : 0) +
    (h.connectivityOk ? 20 : 0) +
    (h.dnsOk ? 20 : 0) +
    (h.tunAvailable ? 15 : 0) +
    (h.trafficActive ? 5 : 0)
  )
}

export function deriveConnectionHealth(h: VpnHealthPayload): ConnectionHealth {
  const score = computeScore(h)

  let state: ConnectionHealthState = 'healthy'
  if (!h.connectivityOk) {
    state = 'offline'
  } else if (!h.apiResponding) {
    state = 'provider_unreachable'
  } else if (!h.dnsOk) {
    state = 'dns_failure'
  } else if (!h.tunAvailable) {
    state = 'tunnel_unstable'
  } else if (score < 80) {
    state = 'degraded'
  }

  return {
    state,
    score,
    dnsOk: h.dnsOk,
    connectivityOk: h.connectivityOk,
    tunAvailable: h.tunAvailable,
    apiResponding: h.apiResponding,
    trafficActive: h.trafficActive,
    checkedAt: h.checkedAt,
  }
}

export function scoreToQualityTier(score: number): QualityTier {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

export const HEALTH_STATE_LABELS: Record<ConnectionHealthState, string> = {
  healthy: 'Стабильное',
  degraded: 'Нестабильное',
  dns_failure: 'Ошибка DNS',
  tunnel_unstable: 'Туннель нестабилен',
  provider_unreachable: 'Сервер недоступен',
  offline: 'Нет интернета',
}
