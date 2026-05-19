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
    staleTime: 10_000,
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
