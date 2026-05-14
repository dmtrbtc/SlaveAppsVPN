export type ServerAvailability = 'online' | 'degraded' | 'offline' | 'unknown'

export interface Server {
  id: string
  name: string
  countryCode: string
  countryName: string
  flagEmoji: string
  availability: ServerAvailability
  latencyMs: number | null
  isFavorite: boolean
  isSelected: boolean
}

export interface ServerStats {
  currentUsers: number
  activeSubscriptions: number
  utilizationPercent: number
}

export interface SelectedServer {
  id: string
  name: string
  countryCode: string
}
