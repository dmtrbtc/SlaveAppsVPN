import { useQuery } from '@tanstack/react-query'
import { diagnosticsApi } from '../lib/api'

export const SYSTEM_INFO_QUERY_KEY = ['diagnostics', 'system'] as const
export const LOGS_QUERY_KEY = ['diagnostics', 'logs'] as const

export function useSystemInfo() {
  return useQuery({
    queryKey: SYSTEM_INFO_QUERY_KEY,
    queryFn: () => diagnosticsApi.collect(),
    staleTime: 30_000,
    retry: 1,
  })
}

export function useLogs() {
  return useQuery({
    queryKey: LOGS_QUERY_KEY,
    queryFn: () => diagnosticsApi.getLogs(),
    staleTime: 10_000,
    retry: 1,
  })
}
