import { useVpnStore, selectVpnHealth } from '../stores/vpn.store'
import {
  deriveConnectionHealth,
  scoreToQualityTier,
  type ConnectionHealth,
  type QualityTier,
} from '../lib/health'

export function useConnectionHealth(): ConnectionHealth | null {
  const raw = useVpnStore(selectVpnHealth)
  if (!raw) return null
  return deriveConnectionHealth(raw)
}

export function useConnectionQualityTier(): QualityTier {
  const health = useConnectionHealth()
  if (!health) return 'good'
  return scoreToQualityTier(health.score)
}
