import { randomUUID } from 'crypto'
import { getSecureStorage } from '../security/SecureStorage'
import { getLogger } from '../logger'
import type {
  SubscriptionEntry,
  SubscriptionAutoUpdate,
  ConfigSourceType,
} from '../../shared/ipc/types'

// Secure-storage keys:
//   subscriptions:index   — JSON metadata array (without raw input)
//   subscriptions:input:<id> — encrypted raw input per entry
// Splitting keeps metadata cheap to read and inputs strictly encrypted.
const INDEX_KEY = 'subscriptions:index'
const INPUT_KEY_PREFIX = 'subscriptions:input:'
const LEGACY_CONFIG_SOURCE_KEY = 'config-source'

interface StoredEntry extends Omit<SubscriptionEntry, 'lastError' | 'nodeCount' | 'lastFetchedAt'> {
  // Persist nullable fields without undefined gaps
  lastError: string | null
  nodeCount: number | null
  lastFetchedAt: number | null
}

interface LegacyConfigSource {
  type: ConfigSourceType
  input: string
  displayName: string
  addedAt: number
  urlDomain?: string
  proxyProtocol?: string
}

function isValidAutoUpdate(v: unknown): v is SubscriptionAutoUpdate {
  return v === 0 || v === 15 || v === 60 || v === 360 || v === 1440
}

export class SubscriptionStore {
  private entries: StoredEntry[] = []
  private loaded = false

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true

    const storage = getSecureStorage()
    const raw = storage.read(INDEX_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          // Defensive: strip any accidental `input` field that may have leaked
          // into the index from older builds. Keep only known StoredEntry fields.
          this.entries = parsed
            .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
            .filter(e => typeof e['id'] === 'string')
            .map(e => {
              const clean = { ...e }
              delete (clean as Record<string, unknown>)['input']
              return clean as unknown as StoredEntry
            })
        }
      } catch (err) {
        getLogger().error({ err }, 'Failed to parse subscriptions index — starting empty')
        this.entries = []
      }
    }

    this.runMigration()
  }

  // One-shot migration from the legacy single-source ConfigSource paradigm.
  // If we have legacy data and no entries yet, create the first SubscriptionEntry.
  private runMigration(): void {
    if (this.entries.length > 0) return

    const storage = getSecureStorage()
    const legacy = storage.read(LEGACY_CONFIG_SOURCE_KEY)
    if (!legacy) return

    try {
      const parsed = JSON.parse(legacy) as LegacyConfigSource
      if (!parsed.type || !parsed.input) return

      const id = randomUUID()
      const entry: StoredEntry = {
        id,
        name: parsed.displayName || 'Migrated subscription',
        type: parsed.type,
        enabled: true,
        autoUpdateMinutes: 60 as SubscriptionAutoUpdate,
        addedAt: parsed.addedAt || Date.now(),
        lastFetchedAt: null,
        lastError: null,
        nodeCount: null,
        ...(parsed.urlDomain ? { urlDomain: parsed.urlDomain } : {}),
        ...(parsed.proxyProtocol ? { proxyProtocol: parsed.proxyProtocol } : {}),
      }
      this.entries.push(entry)
      storage.write(`${INPUT_KEY_PREFIX}${id}`, parsed.input)
      this.persistIndex()
      getLogger().info({ id, type: parsed.type }, 'Migrated legacy config source to subscription store')
    } catch (err) {
      getLogger().warn({ err }, 'Legacy config source migration failed')
    }
  }

  private persistIndex(): void {
    // Persist without `input` — that lives in per-id encrypted blobs.
    const safeIndex: StoredEntry[] = this.entries.map(({ ...rest }) => rest)
    getSecureStorage().write(INDEX_KEY, JSON.stringify(safeIndex))
  }

  list(): SubscriptionEntry[] {
    this.ensureLoaded()
    // Return a defensive copy
    return this.entries.map(e => ({ ...e }))
  }

  getInput(id: string): string | null {
    this.ensureLoaded()
    return getSecureStorage().read(`${INPUT_KEY_PREFIX}${id}`)
  }

  getById(id: string): SubscriptionEntry | null {
    this.ensureLoaded()
    const found = this.entries.find(e => e.id === id)
    return found ? { ...found } : null
  }

  add(input: {
    name?: string
    type: ConfigSourceType
    rawInput: string
    autoUpdateMinutes?: SubscriptionAutoUpdate
    displayName?: string
    urlDomain?: string
    proxyProtocol?: string
    nodeCount?: number | null
  }): SubscriptionEntry {
    this.ensureLoaded()
    const id = randomUUID()
    const entry: StoredEntry = {
      id,
      name: input.name?.trim() || input.displayName?.trim() || 'Untitled',
      type: input.type,
      enabled: true,
      autoUpdateMinutes: isValidAutoUpdate(input.autoUpdateMinutes) ? input.autoUpdateMinutes : (60 as SubscriptionAutoUpdate),
      addedAt: Date.now(),
      lastFetchedAt: null,
      lastError: null,
      nodeCount: input.nodeCount ?? null,
      ...(input.urlDomain ? { urlDomain: input.urlDomain } : {}),
      ...(input.proxyProtocol ? { proxyProtocol: input.proxyProtocol } : {}),
    }
    this.entries.push(entry)
    getSecureStorage().write(`${INPUT_KEY_PREFIX}${id}`, input.rawInput)
    this.persistIndex()
    return { ...entry }
  }

  update(id: string, patch: Partial<Pick<SubscriptionEntry, 'name' | 'enabled' | 'autoUpdateMinutes'>>): SubscriptionEntry {
    this.ensureLoaded()
    const idx = this.entries.findIndex(e => e.id === id)
    if (idx === -1) throw new Error(`Subscription not found: ${id}`)
    const current = this.entries[idx]
    if (!current) throw new Error(`Subscription vanished: ${id}`)
    const next: StoredEntry = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(isValidAutoUpdate(patch.autoUpdateMinutes) ? { autoUpdateMinutes: patch.autoUpdateMinutes } : {}),
    }
    this.entries[idx] = next
    this.persistIndex()
    return { ...next }
  }

  // Mark a fetch outcome — called by aggregator/scheduler.
  recordFetch(id: string, outcome: { nodeCount?: number | null; error?: string | null }): SubscriptionEntry | null {
    this.ensureLoaded()
    const idx = this.entries.findIndex(e => e.id === id)
    if (idx === -1) return null
    const current = this.entries[idx]
    if (!current) return null
    const next: StoredEntry = {
      ...current,
      lastFetchedAt: Date.now(),
      lastError: outcome.error ?? null,
      ...(outcome.nodeCount !== undefined ? { nodeCount: outcome.nodeCount } : {}),
    }
    this.entries[idx] = next
    this.persistIndex()
    return { ...next }
  }

  remove(id: string): void {
    this.ensureLoaded()
    this.entries = this.entries.filter(e => e.id !== id)
    getSecureStorage().delete(`${INPUT_KEY_PREFIX}${id}`)
    this.persistIndex()
  }
}

let _instance: SubscriptionStore | null = null
export function getSubscriptionStore(): SubscriptionStore {
  if (!_instance) _instance = new SubscriptionStore()
  return _instance
}
