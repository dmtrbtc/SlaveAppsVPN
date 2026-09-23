import type { AppSettings, DohProviderSetting, RuleProvider } from '@slave-vpn/core'

export const LEGACY_DNS_PROVIDER_KEY = 'slave.settings.dnsProvider.v1'
export const LEGACY_RULE_LISTS_KEY = 'slave.settings.ruleLists.v1'

interface LegacyStringStore {
  getItem(key: string): string | null
  removeItem(key: string): void
}

interface LegacyRuleListEntry {
  id?: unknown
  name?: unknown
  url?: unknown
  behavior?: unknown
  enabled?: unknown
  intervalHours?: unknown
  builtin?: unknown
}

export interface LegacyAndroidSettings {
  dohProvider?: DohProviderSetting
  ruleProviders?: RuleProvider[]
  keysToRemove: string[]
}

const DEAD_URL_FIXES: Record<string, string> = {
  'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/domains/all.lst':
    'https://raw.githubusercontent.com/1andrevich/Re-filter-lists/main/domains_all.lst',
}

function readJson(store: LegacyStringStore, key: string): unknown {
  try {
    const raw = store.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readLegacyDohProvider(store: LegacyStringStore): DohProviderSetting | undefined {
  const value = readJson(store, LEGACY_DNS_PROVIDER_KEY)
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as { id?: unknown; customUrl?: unknown }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return undefined
  return {
    id: candidate.id,
    ...(typeof candidate.customUrl === 'string' ? { customUrl: candidate.customUrl } : {}),
  }
}

function providerKind(url: string): 'github' | 'url' {
  return /github(?:usercontent)?\.com/i.test(url) ? 'github' : 'url'
}

function readLegacyRuleProviders(store: LegacyStringStore): RuleProvider[] | undefined {
  const value = readJson(store, LEGACY_RULE_LISTS_KEY)
  if (!Array.isArray(value)) return undefined
  const providers = value.flatMap((entry: LegacyRuleListEntry, index): RuleProvider[] => {
    if (!entry || typeof entry !== 'object') return []
    if (typeof entry.url !== 'string' || typeof entry.name !== 'string') return []
    const url = DEAD_URL_FIXES[entry.url] ?? entry.url
    const id = String(entry.id ?? url)
    return [{
      id,
      name: entry.name,
      enabled: entry.enabled !== false,
      kind: providerKind(url),
      url,
      type: entry.behavior === 'ipcidr' ? 'ip-cidr-list' : 'domain-list',
      action: 'proxy',
      priority: 500 + index,
      category: 'russia-bypass',
      ...(entry.builtin ? { isPreset: true } : {}),
      intervalHours:
        typeof entry.intervalHours === 'number' && entry.intervalHours > 0
          ? entry.intervalHours
          : 24,
    }]
  })
  return providers.length > 0 ? providers : undefined
}

/** Read only valid legacy values; malformed keys remain untouched for diagnosis. */
export function readLegacyAndroidSettings(store: LegacyStringStore): LegacyAndroidSettings {
  const dohProvider = readLegacyDohProvider(store)
  const ruleProviders = readLegacyRuleProviders(store)
  return {
    ...(dohProvider ? { dohProvider } : {}),
    ...(ruleProviders ? { ruleProviders } : {}),
    keysToRemove: [
      ...(dohProvider ? [LEGACY_DNS_PROVIDER_KEY] : []),
      ...(ruleProviders ? [LEGACY_RULE_LISTS_KEY] : []),
    ],
  }
}

/**
 * Build the one-time patch without overwriting settings already owned by the
 * unified store. Older Android builds persisted ruleProviders: [] even while
 * the real list lived in a separate key, so an empty array is migratable.
 */
export function buildAndroidSettingsMigration(
  existing: Partial<AppSettings> | null,
  firstRunSeed: Partial<AppSettings>,
  legacy: LegacyAndroidSettings,
): Partial<AppSettings> {
  const patch: Partial<AppSettings> = existing === null ? { ...firstRunSeed } : {}
  const ownsDohProvider = existing !== null && Object.prototype.hasOwnProperty.call(existing, 'dohProvider')
  if (legacy.dohProvider && !ownsDohProvider) patch.dohProvider = legacy.dohProvider

  const storedProviders = existing?.ruleProviders
  if (legacy.ruleProviders && (!Array.isArray(storedProviders) || storedProviders.length === 0)) {
    patch.ruleProviders = legacy.ruleProviders
  }
  return patch
}

export function removeMigratedLegacyKeys(store: LegacyStringStore, keys: readonly string[]): void {
  for (const key of keys) {
    try { store.removeItem(key) } catch { /* best-effort cleanup after durable patch */ }
  }
}
