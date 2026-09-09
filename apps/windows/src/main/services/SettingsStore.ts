import { join } from 'path'
import { app } from 'electron'
import { SettingsStore, SETTINGS_STORAGE_KEY, createDefaultSettings } from '@slave-vpn/core'
import { JsonFileStorageAdapter } from './JsonFileStorageAdapter'

// Core owns the settings model and store lifecycle. Windows only injects
// environment defaults and binds the shared StorageAdapter contract to the
// existing userData/settings.json file.
const DEFAULT_SETTINGS = createDefaultSettings({
  ...(process.env.VITE_API_URL ? { apiBaseUrl: process.env.VITE_API_URL } : {}),
  ...(process.env.VITE_TELEGRAM_BOT_USERNAME
    ? { telegramBotUsername: process.env.VITE_TELEGRAM_BOT_USERNAME }
    : {}),
})

let instance: SettingsStore | null = null
let initializing: Promise<SettingsStore> | null = null

/** Load once during app.whenReady(), before IPC handlers or updater consumers. */
export async function initSettingsStore(): Promise<SettingsStore> {
  if (instance) return instance
  if (!initializing) {
    const filePath = join(app.getPath('userData'), 'settings.json')
    const next = new SettingsStore(
      new JsonFileStorageAdapter(filePath, SETTINGS_STORAGE_KEY),
      DEFAULT_SETTINGS
    )
    initializing = next.load().then(() => {
      instance = next
      return next
    })
  }
  return initializing
}

export function getSettingsStore(): SettingsStore {
  if (!instance) {
    throw new Error(
      'SettingsStore is not initialized — call initSettingsStore() after app.whenReady()'
    )
  }
  return instance
}
