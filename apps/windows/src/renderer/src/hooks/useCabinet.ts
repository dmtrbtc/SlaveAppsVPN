import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cabinetApi } from '../lib/api'

export const CABINET_AUTH_KEY = ['cabinet', 'auth'] as const
export const CABINET_ME_KEY = ['cabinet', 'me'] as const
export const CABINET_SUB_KEY = ['cabinet', 'subscription'] as const

/** Whether a cabinet session exists (tokens stored). Cheap, no network. */
export function useCabinetAuthState() {
  return useQuery({
    queryKey: CABINET_AUTH_KEY,
    queryFn: () => cabinetApi.getAuthState(),
    staleTime: 10_000,
    retry: 0,
  })
}

/** The signed-in cabinet user. Enabled only when authenticated. */
export function useCabinetMe(enabled: boolean) {
  return useQuery({
    queryKey: CABINET_ME_KEY,
    queryFn: () => cabinetApi.getMe(),
    enabled,
    staleTime: 30_000,
    retry: 0,
  })
}

/** Subscription status (days left / traffic / devices). */
export function useCabinetSubscription(enabled: boolean) {
  return useQuery({
    queryKey: CABINET_SUB_KEY,
    queryFn: () => cabinetApi.getSubscription(),
    enabled,
    staleTime: 30_000,
    retry: 0,
  })
}

/** Invalidate cabinet queries after login/logout/import. */
export function useCabinetInvalidate() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['cabinet'] })
  }
}

export function useCabinetEmailLogin() {
  const invalidate = useCabinetInvalidate()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      cabinetApi.loginEmail(email, password),
    onSuccess: () => invalidate(),
  })
}

export function useCabinetLogout() {
  const invalidate = useCabinetInvalidate()
  return useMutation({
    mutationFn: () => cabinetApi.logout(),
    onSuccess: () => invalidate(),
  })
}

export function useCabinetImportSubscription() {
  return useMutation({
    mutationFn: () => cabinetApi.importSubscription(),
  })
}

// ── Account extras (balance / devices / renewal) ─────────────────────────────

export function useCabinetTransactions(enabled: boolean) {
  return useQuery({
    queryKey: ['cabinet', 'transactions'] as const,
    queryFn: () => cabinetApi.getTransactions(),
    enabled,
    staleTime: 30_000,
    retry: 0,
  })
}

export function useCabinetDevices(enabled: boolean) {
  return useQuery({
    queryKey: ['cabinet', 'devices'] as const,
    queryFn: () => cabinetApi.getDevices(),
    enabled,
    staleTime: 30_000,
    retry: 0,
  })
}

export function useCabinetRenewalOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['cabinet', 'renewal-options'] as const,
    queryFn: () => cabinetApi.getRenewalOptions(),
    enabled,
    staleTime: 60_000,
    retry: 0,
  })
}
