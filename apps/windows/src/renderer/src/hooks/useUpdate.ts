import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { updateApi, events } from '../lib/api'
import type { UpdateChannel } from '@shared/ipc/types'

export const UPDATE_STATUS_QUERY_KEY = ['update', 'status'] as const

export function useUpdateStatus() {
  return useQuery({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => updateApi.getStatus(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useUpdateCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => updateApi.check(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY })
    },
  })
}

export function useUpdateDownload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => updateApi.download(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY })
    },
  })
}

export function useUpdateInstall() {
  return useMutation({
    mutationFn: () => updateApi.install(),
  })
}

export function useUpdateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (channel: UpdateChannel) => updateApi.setChannel({ channel }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY })
    },
  })
}

export function useUpdateProgress(): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    return events.onUpdateProgress(p => setProgress(Math.round(p.percent)))
  }, [])

  return progress
}

export function useUpdateEvents() {
  const qc = useQueryClient()

  useEffect(() => {
    const unsubAvailable = events.onUpdateAvailable(() => {
      void qc.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY })
    })
    const unsubDownloaded = events.onUpdateDownloaded(() => {
      void qc.invalidateQueries({ queryKey: UPDATE_STATUS_QUERY_KEY })
    })
    return () => {
      unsubAvailable()
      unsubDownloaded()
    }
  }, [qc])
}
