import { useQuery } from '@tanstack/react-query'
import type { Server } from '@slave-vpn/shared'

export const SERVERS_QUERY_KEY = ['servers'] as const

// Stub: replace with ipc.servers.list() when the IPC endpoint is implemented
async function fetchServers(): Promise<Server[]> {
  await new Promise(r => setTimeout(r, 350))
  return MOCK_SERVERS
}

export function useServers() {
  return useQuery({
    queryKey: SERVERS_QUERY_KEY,
    queryFn: fetchServers,
    staleTime: 60_000,
  })
}

const MOCK_SERVERS: Server[] = [
  { id: '1', name: 'Moscow-01', countryCode: 'RU', countryName: 'Россия', flagEmoji: '🇷🇺', availability: 'online', latencyMs: 12, isFavorite: false, isSelected: false },
  { id: '2', name: 'Amsterdam-01', countryCode: 'NL', countryName: 'Нидерланды', flagEmoji: '🇳🇱', availability: 'online', latencyMs: 45, isFavorite: false, isSelected: false },
  { id: '3', name: 'Frankfurt-01', countryCode: 'DE', countryName: 'Германия', flagEmoji: '🇩🇪', availability: 'online', latencyMs: 52, isFavorite: false, isSelected: false },
  { id: '4', name: 'Helsinki-01', countryCode: 'FI', countryName: 'Финляндия', flagEmoji: '🇫🇮', availability: 'online', latencyMs: 38, isFavorite: false, isSelected: false },
  { id: '5', name: 'Warsaw-01', countryCode: 'PL', countryName: 'Польша', flagEmoji: '🇵🇱', availability: 'degraded', latencyMs: 61, isFavorite: false, isSelected: false },
  { id: '6', name: 'Paris-01', countryCode: 'FR', countryName: 'Франция', flagEmoji: '🇫🇷', availability: 'online', latencyMs: 78, isFavorite: false, isSelected: false },
  { id: '7', name: 'London-01', countryCode: 'GB', countryName: 'Великобритания', flagEmoji: '🇬🇧', availability: 'online', latencyMs: 95, isFavorite: false, isSelected: false },
  { id: '8', name: 'Vilnius-01', countryCode: 'LT', countryName: 'Литва', flagEmoji: '🇱🇹', availability: 'online', latencyMs: 29, isFavorite: false, isSelected: false },
  { id: '9', name: 'New-York-01', countryCode: 'US', countryName: 'США', flagEmoji: '🇺🇸', availability: 'online', latencyMs: 142, isFavorite: false, isSelected: false },
  { id: '10', name: 'Singapore-01', countryCode: 'SG', countryName: 'Сингапур', flagEmoji: '🇸🇬', availability: 'offline', latencyMs: null, isFavorite: false, isSelected: false },
]
