import { Preferences } from '@capacitor/preferences'

/**
 * Renderer-side subscription store for Android.
 *
 * DURABILITY MODEL (why localStorage-primary, not Preferences-primary):
 * Capacitor Preferences is a native plugin that needs `cap sync` to register
 * it in MainActivity. pnpm-workspace symlinks sometimes break that
 * auto-discovery, in which case Preferences throws "Plugin not implemented".
 *
 * The earlier Preferences-primary design had a subtle data-loss bug: a
 * `useFallback` flag flipped to true the first time Preferences threw, but it
 * RESET to false on every app launch. So a value WRITTEN to localStorage in
 * one session could become invisible the next launch (the read tried
 * Preferences.get first, got null/throw, and only then fell back) — the
 * subscription appeared to "not save" and had to be re-added. That is exactly
 * the symptom the user reported.
 *
 * Fix: localStorage is now the DURABLE PRIMARY (synchronous, always present in
 * a WebView, persists across launches). Preferences is a best-effort mirror
 * written/read after localStorage, so we still benefit from
 * EncryptedSharedPreferences when available but never depend on it for
 * correctness. Reads prefer localStorage and fall back to Preferences only
 * when localStorage is empty (e.g. first launch after an OS WebView wipe but
 * the encrypted store survived).
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

// ─── Storage backend: localStorage primary + Preferences mirror ───────────────

function lsGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true } catch { return false }
}
function lsRemove(key: string): void {
  try { window.localStorage.removeItem(key) } catch { /* swallow */ }
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
  // best-effort mirror — never await on the hot path's correctness
  Preferences.set({ key, value }).catch(() => undefined)
}
function prefRemove(key: string): void {
  Preferences.remove({ key }).catch(() => undefined)
}

async function storageGet(key: string): Promise<string | null> {
  const local = lsGet(key)
  if (local !== null) return local
  // localStorage empty — try the encrypted mirror (survives a WebView wipe).
  const mirrored = await prefGet(key)
  if (mirrored !== null) {
    // Re-hydrate localStorage so subsequent reads are synchronous + durable.
    lsSet(key, mirrored)
  }
  return mirrored
}

async function storageSet(key: string, value: string): Promise<void> {
  const ok = lsSet(key, value)
  prefSet(key, value)
  if (!ok) {
    // localStorage refused (private mode / quota). The Preferences mirror is
    // our only durability left — surface failure only if BOTH are unusable.
    const verify = await prefGet(key)
    if (verify !== value) {
      throw new Error('Both localStorage and Preferences failed to persist subscription')
    }
  }
}

async function storageRemove(key: string): Promise<void> {
  lsRemove(key)
  prefRemove(key)
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
