import { Preferences } from '@capacitor/preferences'

/**
 * Renderer-side subscription store for Android. Persisted via Capacitor
 * Preferences (Android EncryptedSharedPreferences under the hood).
 *
 * Capacitor Preferences ships as a native plugin that needs `cap sync` to
 * register it in MainActivity. pnpm-workspace symlinks sometimes break
 * that auto-discovery, in which case Preferences.set() throws "Plugin
 * not implemented" and the whole add-subscription flow dies.
 *
 * To make the store resilient we fall back to localStorage when the
 * native Preferences plugin isn't available. localStorage works in any
 * WebView (no native registration needed). The downside is slightly
 * weaker durability — survives app restarts, may be cleared if the user
 * wipes WebView storage from system settings. Good enough for v1.
 */

const INDEX_KEY = 'slave.subscriptions.index.v1'
const INPUT_KEY = (id: string): string => `slave.subscriptions.input.v1.${id}`

export type AndroidSubscriptionType =
  | 'subscription-url'
  | 'single-proxy'
  | 'remnawave-key'
  | 'provider'

export interface AndroidSubscriptionEntry {
  id: string
  name: string
  type: AndroidSubscriptionType
  enabled: boolean
  autoUpdateMinutes: 0 | 15 | 60 | 360 | 1440
  addedAt: number
  lastFetchedAt: number | null
  lastError: string | null
  nodeCount: number | null
  urlDomain?: string
  proxyProtocol?: string
}

// ─── Storage backend with localStorage fallback ───────────────────────────────

let useFallback = false

async function storageGet(key: string): Promise<string | null> {
  if (!useFallback) {
    try {
      const { value } = await Preferences.get({ key })
      return value ?? null
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[subscription-store] Preferences.get failed, falling back to localStorage', err)
      useFallback = true
    }
  }
  try { return window.localStorage.getItem(key) } catch { return null }
}

async function storageSet(key: string, value: string): Promise<void> {
  if (!useFallback) {
    try {
      await Preferences.set({ key, value })
      return
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[subscription-store] Preferences.set failed, falling back to localStorage', err)
      useFallback = true
    }
  }
  try { window.localStorage.setItem(key, value) } catch (err) {
    throw new Error(`Both Preferences and localStorage failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function storageRemove(key: string): Promise<void> {
  if (!useFallback) {
    try {
      await Preferences.remove({ key })
      return
    } catch {
      useFallback = true
    }
  }
  try { window.localStorage.removeItem(key) } catch { /* swallow */ }
}

// ─── Public store API ─────────────────────────────────────────────────────────

function randomId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function readIndex(): Promise<AndroidSubscriptionEntry[]> {
  const value = await storageGet(INDEX_KEY)
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed as AndroidSubscriptionEntry[]
  } catch {
    /* fall through */
  }
  return []
}

async function writeIndex(entries: AndroidSubscriptionEntry[]): Promise<void> {
  await storageSet(INDEX_KEY, JSON.stringify(entries))
}

function safeUrlDomain(input: string): string | undefined {
  try { return new URL(input).hostname } catch { return undefined }
}

export async function listSubscriptions(): Promise<AndroidSubscriptionEntry[]> {
  return readIndex()
}

export async function getSubscriptionInput(id: string): Promise<string | null> {
  return storageGet(INPUT_KEY(id))
}

export interface AddSubscriptionOptions {
  type: AndroidSubscriptionType
  input: string
  name?: string
  autoUpdateMinutes?: AndroidSubscriptionEntry['autoUpdateMinutes']
}

export async function addSubscription(options: AddSubscriptionOptions): Promise<AndroidSubscriptionEntry> {
  const id = randomId()
  const entry: AndroidSubscriptionEntry = {
    id,
    name: options.name?.trim() || defaultName(options),
    type: options.type,
    enabled: true,
    autoUpdateMinutes: options.autoUpdateMinutes ?? 360,
    addedAt: Date.now(),
    lastFetchedAt: null,
    lastError: null,
    nodeCount: null,
    ...(options.type === 'subscription-url'
      ? { urlDomain: safeUrlDomain(options.input) ?? '' }
      : {}),
  }
  // Persist input FIRST so a partial failure leaves no dangling index entry.
  await storageSet(INPUT_KEY(id), options.input)
  const entries = await readIndex()
  entries.push(entry)
  await writeIndex(entries)
  return entry
}

export async function removeSubscription(id: string): Promise<void> {
  const entries = await readIndex()
  await writeIndex(entries.filter(e => e.id !== id))
  await storageRemove(INPUT_KEY(id))
}

export async function updateSubscriptionMeta(
  id: string,
  patch: Partial<AndroidSubscriptionEntry>,
): Promise<AndroidSubscriptionEntry | null> {
  const entries = await readIndex()
  const idx = entries.findIndex(e => e.id === id)
  if (idx < 0) return null
  const existing = entries[idx]
  if (!existing) return null
  const updated: AndroidSubscriptionEntry = { ...existing, ...patch, id: existing.id }
  entries[idx] = updated
  await writeIndex(entries)
  return updated
}

function defaultName(options: AddSubscriptionOptions): string {
  if (options.type === 'subscription-url') {
    const host = safeUrlDomain(options.input)
    return host ?? 'Subscription'
  }
  if (options.type === 'single-proxy') return 'Single proxy'
  if (options.type === 'remnawave-key') return 'Remnawave key'
  return 'Subscription'
}
