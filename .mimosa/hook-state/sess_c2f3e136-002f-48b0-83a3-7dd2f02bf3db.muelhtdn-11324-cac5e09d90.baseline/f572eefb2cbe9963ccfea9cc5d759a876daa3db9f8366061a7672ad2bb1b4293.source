import { Preferences } from '@capacitor/preferences'
import type { StorageAdapter } from '@slave-vpn/core'
import { createMirroredStringStore } from './mirrored-string-store'

/**
 * Android StorageAdapter — the platform binding @slave-vpn/core stores settings,
 * subscriptions, rule-lists, etc. through.
 *
 * Durability model mirrors android/subscription-store.ts: localStorage is the
 * synchronous DURABLE PRIMARY (always present in a WebView, survives launches),
 * with Capacitor Preferences as a best-effort encrypted mirror. Reads prefer
 * localStorage and fall back to the mirror only when localStorage is empty (e.g.
 * first launch after an OS WebView wipe). Values are JSON-serialised.
 */

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
function lsRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* swallow */
  }
}

const storage = createMirroredStringStore(
  { get: lsGet, set: lsSet, remove: lsRemove },
  {
    get: async key => (await Preferences.get({ key })).value ?? null,
    set: async (key, value) => { await Preferences.set({ key, value }) },
    remove: async key => { await Preferences.remove({ key }) },
  },
)

export function createAndroidStorageAdapter(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await storage.get(key)
      if (raw === null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await storage.set(key, JSON.stringify(value))
    },
    async remove(key: string): Promise<void> {
      storage.remove(key)
    },
    async keys(prefix?: string): Promise<string[]> {
      const out: string[] = []
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)
          if (k && (!prefix || k.startsWith(prefix))) out.push(k)
        }
      } catch {
        /* localStorage unavailable */
      }
      return out
    },
  }
}
