import { useQuery } from '@tanstack/react-query'
import type { Server } from '@slave-vpn/shared'
import { serversApi } from '../lib/api'

export const SERVERS_QUERY_KEY = ['servers'] as const

export function useServers() {
  return useQuery<Server[]>({
    queryKey: SERVERS_QUERY_KEY,
    queryFn: () => serversApi.list(),
    staleTime: 60_000,
  })
}
