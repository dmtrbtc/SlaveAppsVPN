import { useQuery } from '@tanstack/react-query'
import { subscriptionApi } from '../lib/api'

export const SUBSCRIPTION_QUERY_KEY = ['subscription'] as const

export function useSubscription() {
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: () => subscriptionApi.get(),
    staleTime: 120_000,
    retry: 1,
  })
}
