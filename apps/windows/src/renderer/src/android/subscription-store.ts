import { Preferences } from '@capacitor/preferences'
import type { SubscriptionEntry, SubscriptionSourceType } from '@slave-vpn/core'
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

function safeUrlDomain(input: string): string | undefined {
  try { return new URL(input).hostname } catch { return undefined }
}

export async function listSubscriptions(): Promise<AndroidSubscriptionEntry[]> {
  return readIndex()
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

export async function addSubscription(options: AddSubscriptionOptions): Promise<AndroidSubscriptionEntry> {
  const id = randomId()
  // Auto-correct a proxy-URI key pasted into the URL field → 'single-proxy'.
  const type = detectInputType(options.input, options.type)
  const entry: AndroidSubscriptionEntry = {
    id,
    name: options.name?.trim() || defaultName({ ...options, type }),
    type,
    enabled: true,
    autoUpdateMinutes: options.autoUpdateMinutes ?? 360,
    addedAt: Date.now(),
    lastFetchedAt: null,
    lastError: null,
    nodeCount: null,
    ...(type === 'subscription-url'
      ? { urlDomain: safeUrlDomain(options.input) ?? '' }
      : {}),
  }
  // Persist input FIRST so a partial failure leaves no dangling index entry.
  await storage.set(INPUT_KEY(id), options.input)
  const entries = await readIndex()
  entries.push(entry)
  await writeIndex(entries)
  return entry
}

export async function removeSubscription(id: string): Promise<void> {
  const entries = await readIndex()
  await writeIndex(entries.filter(e => e.id !== id))
  storage.remove(INPUT_KEY(id))
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
