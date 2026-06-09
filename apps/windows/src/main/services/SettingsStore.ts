import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createDefaultSettings } from '@slave-vpn/core'
import type { AppSettings } from '../../shared/ipc/types'

// Default settings model + enabled-scenario defaults now come from
// @slave-vpn/core (createDefaultSettings); only the env-driven fields are
// injected here (core must not read process.env). The store mechanism stays
// the existing sync electron userData file.
const DEFAULT_SETTINGS: AppSettings = createDefaultSettings({
  ...(process.env.VITE_API_URL ? { apiBaseUrl: process.env.VITE_API_URL } : {}),
  ...(process.env.VITE_TELEGRAM_BOT_USERNAME
    ? { telegramBotUsername: process.env.VITE_TELEGRAM_BOT_USERNAME }
    : {}),
})

class SettingsStore {
  private settings: AppSettings
  private readonly filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.filePath = join(userDataPath, 'settings.json')
    this.settings = this.load()
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  getAll(): AppSettings {
    return { ...this.settings }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  patch(partial: { [K in keyof AppSettings]?: AppSettings[K] | undefined }): void {
    const clean = Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v !== undefined)
    ) as Partial<AppSettings>
    this.settings = { ...this.settings, ...clean }
    this.persist()
  }

  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS }
    this.persist()
  }
}

let _instance: SettingsStore | null = null

export function getSettingsStore(): SettingsStore {
  if (!_instance) {
    _instance = new SettingsStore()
  }
  return _instance
}
