import { useQuery } from '@tanstack/react-query'
import { diagnosticsApi, vpnApi, configSourceApi } from '../lib/api'

export const SYSTEM_INFO_QUERY_KEY = ['diagnostics', 'system'] as const
export const LOGS_QUERY_KEY = ['diagnostics', 'logs'] as const
export const CONNECTIVITY_QUERY_KEY = ['diagnostics', 'connectivity'] as const
export const STARTUP_QUERY_KEY = ['diagnostics', 'startup'] as const
export const CONFIG_SOURCE_META_QUERY_KEY = ['diagnostics', 'configSourceMeta'] as const

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
    // Poll while the Diagnostics panel is open so engine/lifecycle lines appear
    // live (the native log ring buffer fills as mihomo runs; without this the
    // first — usually empty, pre-connect — fetch stuck and the panel read "Логов
    // нет" even after connecting). react-query only polls while observed.
    staleTime: 2_000,
    refetchInterval: 3_000,
    retry: 1,
  })
}

export function useConnectivity() {
  return useQuery({
    queryKey: CONNECTIVITY_QUERY_KEY,
    queryFn: () => vpnApi.getConnectivity(),
    staleTime: 5_000,
    refetchInterval: 10_000,
    retry: 1,
  })
}

export function useStartupReport() {
  return useQuery({
    queryKey: STARTUP_QUERY_KEY,
    queryFn: () => diagnosticsApi.getStartup(),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useConfigSourceMeta() {
  return useQuery({
    queryKey: CONFIG_SOURCE_META_QUERY_KEY,
    queryFn: () => configSourceApi.getMeta(),
    staleTime: 30_000,
    retry: 1,
  })
}
