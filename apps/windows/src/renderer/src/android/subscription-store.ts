import { Preferences } from '@capacitor/preferences'

/**
 * Renderer-side subscription store for Android. Persisted via Capacitor
 * Preferences (Android EncryptedSharedPreferences under the hood).
 *
 * Mirrors the shape of SubscriptionEntry in apps/windows/src/shared/ipc/types.ts
 * — keeps the renderer code path identical to Windows.
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

function randomId(): string {
  // Sufficiently unique for one device — not a security boundary
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function readIndex(): Promise<AndroidSubscriptionEntry[]> {
  const { value } = await Preferences.get({ key: INDEX_KEY })
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
  await Preferences.set({ key: INDEX_KEY, value: JSON.stringify(entries) })
}

function safeUrlDomain(input: string): string | undefined {
  try { return new URL(input).hostname } catch { return undefined }
}

export async function listSubscriptions(): Promise<AndroidSubscriptionEntry[]> {
  return readIndex()
}

export async function getSubscriptionInput(id: string): Promise<string | null> {
  const { value } = await Preferences.get({ key: INPUT_KEY(id) })
  return value ?? null
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
  const entries = await readIndex()
  entries.push(entry)
  await writeIndex(entries)
  await Preferences.set({ key: INPUT_KEY(id), value: options.input })
  return entry
}

export async function removeSubscription(id: string): Promise<void> {
  const entries = await readIndex()
  await writeIndex(entries.filter(e => e.id !== id))
  await Preferences.remove({ key: INPUT_KEY(id) })
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
