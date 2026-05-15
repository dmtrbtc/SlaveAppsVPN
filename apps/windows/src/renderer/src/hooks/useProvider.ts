import { useQuery } from '@tanstack/react-query'
import { providerApi } from '../lib/api'
import type { ProviderManifestPayload, ProviderCapabilitiesPayload } from '@shared/ipc/types'

export const PROVIDER_QUERY_KEY = ['provider'] as const

export function useProviderManifest() {
  return useQuery<ProviderManifestPayload>({
    queryKey: [...PROVIDER_QUERY_KEY, 'manifest'],
    queryFn: () => providerApi.getManifest(),
    staleTime: Infinity,
    retry: 2,
  })
}

export function useProviderCapabilities() {
  return useQuery<ProviderCapabilitiesPayload>({
    queryKey: [...PROVIDER_QUERY_KEY, 'capabilities'],
    queryFn: () => providerApi.getCapabilities(),
    staleTime: Infinity,
    retry: 2,
  })
}

export function useFeatureAvailable(feature: keyof ProviderCapabilitiesPayload): boolean {
  const { data } = useProviderCapabilities()
  return data?.[feature] ?? false
}
