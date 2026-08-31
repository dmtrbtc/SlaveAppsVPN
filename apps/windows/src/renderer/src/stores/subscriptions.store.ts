import { create } from 'zustand'
import { subscriptionsApi, events } from '../lib/api'
import { IS_MOBILE } from '../lib/platform'
import { retryEmptyHydration } from './empty-hydration-retry'
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

  fetch: (options?: { silent?: boolean }) => Promise<void>
  add: (payload: SubscriptionAddPayload) => Promise<SubscriptionEntry>
  update: (id: string, patch: { name?: string; enabled?: boolean; autoUpdateMinutes?: SubscriptionAutoUpdate }) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  refresh: (id: string) => Promise<void>
  refreshAll: () => Promise<void>
}

// Local helpers that close over the store after creation.
let setPending: ((key: string, on: boolean) => void) | null = null
let hydrationRun = 0

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
    const run = ++hydrationRun
    const unsub = events.onSubscriptionsChanged((entries: SubscriptionEntry[]) => {
      set({ entries })
    })
    set({ _unsubscribe: unsub })
    void get().fetch().then(() => {
      if (!IS_MOBILE || get().entries.length > 0 || run !== hydrationRun) return
      void retryEmptyHydration(
        () => get().fetch({ silent: true }),
        () => run === hydrationRun && get()._unsubscribe !== null && get().entries.length === 0,
      )
    })
  },

  dispose: () => {
    hydrationRun++
    const u = get()._unsubscribe
    if (u) u()
    set({ _unsubscribe: null })
  },

  fetch: async (options) => {
    if (!options?.silent) set({ loading: true, error: null })
    try {
      const entries = await subscriptionsApi.list()
      set({ entries, loading: options?.silent ? get().loading : false })
    } catch (err) {
      if (!options?.silent) {
        set({ error: err instanceof Error ? err.message : String(err), loading: false })
      }
    }
  },

  add: async (payload) => {
    return track('__add__', async () => {
      const outcome = await subscriptionsApi.add(payload)
      const { entry } = outcome
      if (!outcome.created) {
        set(s => ({ entries: s.entries.some(e => e.id === entry.id)
          ? s.entries.map(e => e.id === entry.id ? entry : e)
          : [...s.entries, entry] }))
        throw new Error('Эта подписка уже добавлена')
      }
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

  reorder: async (ids) => {
    return track('__reorder__', async () => {
      const previous = get().entries
      const byId = new Map(previous.map(entry => [entry.id, entry]))
      set({ entries: ids.map(id => byId.get(id)).filter((entry): entry is SubscriptionEntry => !!entry) })
      try {
        const entries = await subscriptionsApi.reorder({ ids })
        set({ entries })
      } catch (err) {
        set({ entries: previous })
        throw err
      }
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
