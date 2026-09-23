import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { safeModeApi } from '../lib/api'

export const SAFE_MODE_QUERY_KEY = ['safeMode', 'status'] as const

export function useSafeModeStatus() {
  return useQuery({
    queryKey: SAFE_MODE_QUERY_KEY,
    queryFn: () => safeModeApi.getStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useSafeModeReset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => safeModeApi.reset(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SAFE_MODE_QUERY_KEY })
    },
  })
}
