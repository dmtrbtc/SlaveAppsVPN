import type { StorageAdapter } from '../adapters/StorageAdapter.js'
import type { AppSettings } from './types.js'
import { createDefaultSettings } from './defaults.js'

export const SETTINGS_STORAGE_KEY = 'slave.settings.v1'

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

  constructor(
    private readonly storage: StorageAdapter,
    private readonly defaults: AppSettings = createDefaultSettings(),
  ) {
    this.settings = { ...defaults }
  }

  /** Hydrate from storage, merging persisted values over the defaults. */
  async load(): Promise<AppSettings> {
    try {
      const stored = await this.storage.get<Partial<AppSettings>>(SETTINGS_STORAGE_KEY)
      if (stored) this.settings = { ...this.defaults, ...stored }
    } catch {
      this.settings = { ...this.defaults }
    }
    return this.getAll()
  }

  getAll(): AppSettings {
    return { ...this.settings }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  async patch(partial: { [K in keyof AppSettings]?: AppSettings[K] | undefined }): Promise<AppSettings> {
    const clean = Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v !== undefined),
    ) as Partial<AppSettings>
    this.settings = { ...this.settings, ...clean }
    await this.storage.set(SETTINGS_STORAGE_KEY, this.settings)
    return this.getAll()
  }

  async reset(): Promise<AppSettings> {
    this.settings = { ...this.defaults }
    await this.storage.set(SETTINGS_STORAGE_KEY, this.settings)
    return this.getAll()
  }
}
