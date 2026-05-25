import { create } from 'zustand'
import { subscriptionsApi, events } from '../lib/api'
import type {
  SubscriptionEntry,
  SubscriptionAddPayload,
  SubscriptionAutoUpdate,
} from '@shared/ipc/types'

interface SubscriptionsStore {
  entries: SubscriptionEntry[]
  loading: boolean
  error: string | null
  // operations in-flight, keyed by entry id (or '__add__' / '__refreshAll__')
  pending: Set<string>
  // last subscribe handle for cleanup
  _unsubscribe: (() => void) | null

  init: () => void
  dispose: () => void

  fetch: () => Promise<void>
  add: (payload: SubscriptionAddPayload) => Promise<SubscriptionEntry>
  update: (id: string, patch: { name?: string; enabled?: boolean; autoUpdateMinutes?: SubscriptionAutoUpdate }) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: (id: string) => Promise<void>
  refreshAll: () => Promise<void>
}

// Local helpers that close over the store after creation.
let setPending: ((key: string, on: boolean) => void) | null = null

function track<T>(key: string, fn: () => Promise<T>): Promise<T> {
  setPending?.(key, true)
  return fn().finally(() => setPending?.(key, false))
}

export const useSubscriptionsStore = create<SubscriptionsStore>((set, get) => {
  setPending = (key, on) => {
    set(s => {
      const next = new Set(s.pending)
      if (on) next.add(key)
      else next.delete(key)
      return { pending: next }
    })
  }
  return {
  entries: [],
  loading: false,
  error: null,
  pending: new Set(),
  _unsubscribe: null,

  init: () => {
    if (get()._unsubscribe) return
    const unsub = events.onSubscriptionsChanged((entries: SubscriptionEntry[]) => {
      set({ entries })
    })
    set({ _unsubscribe: unsub })
    void get().fetch()
  },

  dispose: () => {
    const u = get()._unsubscribe
    if (u) u()
    set({ _unsubscribe: null })
  },

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const entries = await subscriptionsApi.list()
      set({ entries, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  add: async (payload) => {
    return track('__add__', async () => {
      const entry = await subscriptionsApi.add(payload)
      // Event will refresh the list, but optimistically:
      set(s => ({ entries: s.entries.some(e => e.id === entry.id) ? s.entries : [...s.entries, entry] }))
      return entry
    })
  },

  update: async (id, patch) => {
    return track(id, async () => {
      await subscriptionsApi.update({ id, ...patch })
    })
  },

  remove: async (id) => {
    return track(id, async () => {
      await subscriptionsApi.remove({ id })
      set(s => ({ entries: s.entries.filter(e => e.id !== id) }))
    })
  },

  refresh: async (id) => {
    return track(id, async () => {
      await subscriptionsApi.refresh({ id })
    })
  },

  refreshAll: async () => {
    return track('__refreshAll__', async () => {
      await subscriptionsApi.refreshAll()
    })
  },
  }
})
