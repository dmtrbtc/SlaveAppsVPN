import { Preferences } from '@capacitor/preferences'
import {
  canonicalSubscriptionSource,
  deduplicateSubscriptionSources,
  normalizeSubscriptionPriorities,
  reorderSubscriptionsByIds,
  type SubscriptionEntry,
  type SubscriptionSourceType,
} from '@slave-vpn/core'
import { createMirroredStringStore } from './adapters/mirrored-string-store'

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

export type AndroidSubscriptionType = SubscriptionSourceType
export type AndroidSubscriptionEntry = SubscriptionEntry

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

const storage = createMirroredStringStore(
  { get: lsGet, set: lsSet, remove: lsRemove },
  {
    get: async key => (await Preferences.get({ key })).value ?? null,
    set: async (key, value) => { await Preferences.set({ key, value }) },
    remove: async key => { await Preferences.remove({ key }) },
  },
)

// ─── Public store API ─────────────────────────────────────────────────────────

function randomId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function readIndex(): Promise<AndroidSubscriptionEntry[]> {
  const value = await storage.get(INDEX_KEY)
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
  await storage.set(INDEX_KEY, JSON.stringify(entries))
}

let mutationQueue = Promise.resolve()

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const pending = mutationQueue.catch(() => undefined).then(mutation)
  mutationQueue = pending.then(() => undefined, () => undefined)
  return pending
}

async function repairIndex(): Promise<AndroidSubscriptionEntry[]> {
  const original = await readIndex()
  const records = await Promise.all(original.map(async entry => ({
    entry,
    input: await storage.get(INPUT_KEY(entry.id)),
  })))
  const { entries: repaired, duplicateIds } = deduplicateSubscriptionSources(records)
  if (JSON.stringify(repaired) !== JSON.stringify(original)) await writeIndex(repaired)
  for (const id of duplicateIds) storage.remove(INPUT_KEY(id))
  return repaired
}

function safeUrlDomain(input: string): string | undefined {
  try { return new URL(input).hostname } catch { return undefined }
}

export async function listSubscriptions(): Promise<AndroidSubscriptionEntry[]> {
  return serializeMutation(repairIndex)
}

export async function getSubscriptionInput(id: string): Promise<string | null> {
  return storage.get(INPUT_KEY(id))
}

export interface AddSubscriptionOptions {
  type: AndroidSubscriptionType
  input: string
  name?: string
  autoUpdateMinutes?: AndroidSubscriptionEntry['autoUpdateMinutes']
}

// A raw proxy key (vless://, vmess://, ss://, trojan://, hysteria2://, tuic://, …)
// vs a subscription URL (http/https). When the user pastes a KEY into the URL
// field, it must be stored as 'single-proxy' — otherwise fetchEntry tries an HTTP
// GET on "vless://…" and fails. Subscription URLs are http(s); remnawave-key is a
// bare token (kept as-is).
const PROXY_URI_RE = /^(vless|vmess|ss|ssr|trojan|hysteria2?|hy2|tuic|wireguard|socks5?|anytls|mieru):\/\//i

/** Effective source type for an input, auto-detecting a pasted proxy-URI key. */
export function detectInputType(input: string, fallback: AndroidSubscriptionType): AndroidSubscriptionType {
  return PROXY_URI_RE.test(input.trim()) ? 'single-proxy' : fallback
}

export interface AddSubscriptionResult {
  entry: AndroidSubscriptionEntry
  created: boolean
}

export async function addSubscription(options: AddSubscriptionOptions): Promise<AddSubscriptionResult> {
  return serializeMutation(async () => {
    const input = options.input.trim()
    const type = detectInputType(input, options.type)
    const identity = canonicalSubscriptionSource(type, input)
    const entries = await repairIndex()
    for (const existing of entries) {
      const existingInput = await storage.get(INPUT_KEY(existing.id))
      if (existingInput && canonicalSubscriptionSource(existing.type, existingInput) === identity) {
        return { entry: existing, created: false }
      }
    }

    const id = randomId()
    const entry: AndroidSubscriptionEntry = {
      id,
      name: options.name?.trim() || defaultName({ ...options, input, type }),
      type,
      enabled: true,
      autoUpdateMinutes: options.autoUpdateMinutes ?? 360,
      priority: (entries.length + 1) * 10,
      addedAt: Date.now(),
      lastFetchedAt: null,
      lastError: null,
      nodeCount: null,
      ...(type === 'subscription-url'
        ? { urlDomain: safeUrlDomain(input) ?? '' }
        : {}),
    }
    // Persist input FIRST so a partial failure leaves no dangling index entry.
    await storage.set(INPUT_KEY(id), input)
    await writeIndex([...entries, entry])
    return { entry, created: true }
  })
}

export async function removeSubscription(id: string): Promise<void> {
  return serializeMutation(async () => {
    const entries = await repairIndex()
    await writeIndex(normalizeSubscriptionPriorities(entries.filter(e => e.id !== id)))
    storage.remove(INPUT_KEY(id))
  })
}

export async function updateSubscriptionMeta(
  id: string,
  patch: Partial<AndroidSubscriptionEntry>,
): Promise<AndroidSubscriptionEntry | null> {
  return serializeMutation(async () => {
    const entries = await repairIndex()
    const idx = entries.findIndex(e => e.id === id)
    if (idx < 0) return null
    const existing = entries[idx]
    if (!existing) return null
    const updated: AndroidSubscriptionEntry = {
      ...existing,
      ...patch,
      id: existing.id,
      priority: existing.priority ?? (idx + 1) * 10,
    }
    entries[idx] = updated
    await writeIndex(entries)
    return updated
  })
}

export async function reorderSubscriptions(ids: readonly string[]): Promise<AndroidSubscriptionEntry[]> {
  return serializeMutation(async () => {
    const entries = await repairIndex()
    const reordered = reorderSubscriptionsByIds(entries, ids)
    await writeIndex(reordered)
    return reordered
  })
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
