import { Preferences } from '@capacitor/preferences'
import type { StorageAdapter } from '@slave-vpn/core'

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

async function prefGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key })
    return value ?? null
  } catch {
    return null
  }
}
function prefSet(key: string, value: string): void {
  Preferences.set({ key, value }).catch(() => undefined)
}
function prefRemove(key: string): void {
  Preferences.remove({ key }).catch(() => undefined)
}

async function rawGet(key: string): Promise<string | null> {
  const local = lsGet(key)
  if (local !== null) return local
  const mirrored = await prefGet(key)
  if (mirrored !== null) lsSet(key, mirrored)
  return mirrored
}

async function rawSet(key: string, value: string): Promise<void> {
  const ok = lsSet(key, value)
  prefSet(key, value)
  if (!ok) {
    const verify = await prefGet(key)
    if (verify !== value) {
      throw new Error('Both localStorage and Preferences failed to persist')
    }
  }
}

export function createAndroidStorageAdapter(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await rawGet(key)
      if (raw === null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await rawSet(key, JSON.stringify(value))
    },
    async remove(key: string): Promise<void> {
      lsRemove(key)
      prefRemove(key)
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
