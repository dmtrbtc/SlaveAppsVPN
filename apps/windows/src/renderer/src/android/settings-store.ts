import {
  SettingsStore,
  SETTINGS_STORAGE_KEY,
  createDefaultSettings,
  type AppSettings,
} from '@slave-vpn/core'
import { createAndroidStorageAdapter } from './adapters/storage'

// The first Android build that persisted a full settings object seeded this set
// (smart-russia-bypass = direct-default → blocked sites went DIRECT). We now
// default to roscomvpn-default (proxy-default). Upgrade installs that still carry
// EXACTLY the legacy seed — i.e. the user never deliberately changed scenarios —
// without clobbering a deliberate choice.
const LEGACY_SEED_SCENARIOS = ['smart-russia-bypass', 'ai-services']

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((x) => sb.has(x))
}

/**
 * Android settings store — the durable source of truth for the FULL AppSettings
 * (vpnMode, dnsPreset, dnsStrategy, enabledScenarios, utlsFingerprint, …),
 * backed by @slave-vpn/core.SettingsStore over the Android StorageAdapter.
 *
 * Previously Android only kept an in-memory `currentMode` + a couple of
 * localStorage keys, so DNS/routing/scenario choices never persisted. This makes
 * the same settings model Windows uses persist on Android too — the foundation
 * for the connect-path switch in P1.
 */

let store: SettingsStore | null = null
let loaded = false

function getStore(): SettingsStore {
  if (!store) store = new SettingsStore(createAndroidStorageAdapter())
  return store
}

/**
 * Hydrate the store. `migrate` is applied ONCE, only when no settings were
 * persisted yet — used to carry the legacy per-key prefs (old vpnMode / uTLS
 * localStorage values) into the unified store without clobbering a returning
 * user's saved settings.
 */
export async function initAndroidSettings(migrate?: Partial<AppSettings>): Promise<AppSettings> {
  const storage = createAndroidStorageAdapter()
  const existing = await storage.get(SETTINGS_STORAGE_KEY)
  store = new SettingsStore(storage)
  const result = await store.load()
  loaded = true
  if (existing == null && migrate && Object.keys(migrate).length > 0) {
    return store.patch(migrate)
  }
  // One-time scenario-default upgrade for installs still on the legacy seed.
  if (existing != null && sameSet(result.enabledScenarios, LEGACY_SEED_SCENARIOS)) {
    return store.patch({ enabledScenarios: createDefaultSettings().enabledScenarios })
  }
  return result
}

export function androidSettingsLoaded(): boolean {
  return loaded
}

export function androidSettings(): AppSettings {
  return getStore().getAll()
}

export async function patchAndroidSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return getStore().patch(partial)
}
