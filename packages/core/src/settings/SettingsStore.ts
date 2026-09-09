import type { StorageAdapter } from '../adapters/StorageAdapter.js'
import type { AppSettings } from './types.js'
import { createDefaultSettings } from './defaults.js'

export const SETTINGS_STORAGE_KEY = 'slave.settings.v1'

// AppSettings contains JSON-shaped values. Keep optional undefined properties
// without depending on structuredClone (unavailable in older supported WebViews).
function copySettingsValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => copySettingsValue(item)) as T
  if (value === null || typeof value !== 'object') return value
  const copy = {}
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copySettingsValue((value as Record<string, unknown>)[key]),
      enumerable: true, writable: true, configurable: true,
    })
  }
  return copy as T
}

/**
 * Storage-backed settings store, platform-agnostic.
 *
 * Replaces the Windows SettingsStore (electron-store + node:fs) and the Android
 * localStorage settings — both become a StorageAdapter behind this one class.
 * Async because StorageAdapter is async (Capacitor Preferences). Callers load()
 * once at startup, then read the in-memory snapshot synchronously via getAll/get.
 */
export class SettingsStore {
  private settings: AppSettings
  private writeQueue: Promise<AppSettings>

  constructor(
    private readonly storage: StorageAdapter,
    private readonly defaults: AppSettings = createDefaultSettings()
  ) {
    this.defaults = copySettingsValue(defaults)
    this.settings = copySettingsValue(this.defaults)
    this.writeQueue = Promise.resolve(copySettingsValue(this.settings))
  }

  /** Hydrate from storage, merging persisted values over the defaults. */
  async load(): Promise<AppSettings> {
    try {
      const stored = await this.storage.get<Partial<AppSettings>>(SETTINGS_STORAGE_KEY)
      if (stored) this.settings = copySettingsValue({ ...this.defaults, ...stored })
    } catch {
      this.settings = copySettingsValue(this.defaults)
    }
    this.writeQueue = Promise.resolve(copySettingsValue(this.settings))
    return this.getAll()
  }

  getAll(): AppSettings {
    return copySettingsValue(this.settings)
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return copySettingsValue(this.settings[key])
  }

  async patch(partial: {
    [K in keyof AppSettings]?: AppSettings[K] | undefined
  }): Promise<AppSettings> {
    const clean = Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v !== undefined)
    ) as Partial<AppSettings>
    this.settings = copySettingsValue({ ...this.settings, ...clean })
    await this.persist(this.getAll())
    return this.getAll()
  }

  async reset(): Promise<AppSettings> {
    this.settings = copySettingsValue(this.defaults)
    await this.persist(this.getAll())
    return this.getAll()
  }

  /** Wait for the latest full snapshot; a failed write blocks consumers until a later write succeeds. */
  async waitForPersistence(): Promise<AppSettings> {
    for (;;) {
      const pending = this.writeQueue
      try {
        const acknowledged = await pending
        if (pending === this.writeQueue) return copySettingsValue(acknowledged)
      } catch (error) {
        if (pending === this.writeQueue) throw error
      }
    }
  }

  /**
   * Preserve call order across asynchronous platform adapters. `patch()` updates
   * the in-memory snapshot synchronously, so two callers can legitimately start
   * writes before the first adapter operation finishes. Serialising immutable
   * snapshots prevents an older write from landing after a newer one.
   */
  private persist(snapshot: AppSettings): Promise<AppSettings> {
    const write = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await this.storage.set(SETTINGS_STORAGE_KEY, copySettingsValue(snapshot))
        return snapshot
      })
    this.writeQueue = write
    return write
  }
}
