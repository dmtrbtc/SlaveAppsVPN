import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../lib/api'
import type { AppSettings } from '@shared/ipc/types'

export const SETTINGS_QUERY_KEY = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => settingsApi.get(),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (partial: Partial<AppSettings>) => settingsApi.set(partial),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_QUERY_KEY })
      const previous = queryClient.getQueryData<AppSettings>(SETTINGS_QUERY_KEY)
      queryClient.setQueryData<AppSettings>(SETTINGS_QUERY_KEY, old =>
        old ? { ...old, ...partial } : old
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(SETTINGS_QUERY_KEY, ctx.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
    },
  })
}
