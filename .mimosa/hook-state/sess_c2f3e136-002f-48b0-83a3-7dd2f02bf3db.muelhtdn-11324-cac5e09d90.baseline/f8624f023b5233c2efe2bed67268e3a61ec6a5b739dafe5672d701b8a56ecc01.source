import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_DNS_PROVIDER_KEY,
  LEGACY_RULE_LISTS_KEY,
  buildAndroidSettingsMigration,
  readLegacyAndroidSettings,
  removeMigratedLegacyKeys,
} from '../src/renderer/src/android/settings-migration.ts'

function memoryStore(values: Record<string, string>) {
  const data = new Map(Object.entries(values))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => { data.delete(key) },
    data,
  }
}

test('legacy DNS and rule lists migrate without losing toggles, intervals or URL repair', () => {
  const store = memoryStore({
    [LEGACY_DNS_PROVIDER_KEY]: JSON.stringify({ id: 'custom', customUrl: 'https://dns.example/dns-query' }),
    [LEGACY_RULE_LISTS_KEY]: JSON.stringify([
      {
        id: 'legacy-builtin',
        name: 'Legacy builtin',
        url: 'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/domains/all.lst',
        behavior: 'domain',
        enabled: false,
        intervalHours: 6,
        builtin: true,
      },
      {
        id: 'custom-ip',
        name: 'Custom IP',
        url: 'https://example.com/ip.txt',
        behavior: 'ipcidr',
        enabled: true,
        intervalHours: 12,
      },
    ]),
  })

  const legacy = readLegacyAndroidSettings(store)
  assert.deepEqual(legacy.dohProvider, { id: 'custom', customUrl: 'https://dns.example/dns-query' })
  assert.equal(legacy.ruleProviders?.length, 2)
  assert.equal(legacy.ruleProviders?.[0]?.enabled, false)
  assert.equal(legacy.ruleProviders?.[0]?.intervalHours, 6)
  assert.equal(legacy.ruleProviders?.[0]?.isPreset, true)
  assert.equal(
    legacy.ruleProviders?.[0]?.url,
    'https://raw.githubusercontent.com/1andrevich/Re-filter-lists/main/domains_all.lst',
  )
  assert.equal(legacy.ruleProviders?.[1]?.type, 'ip-cidr-list')

  const patch = buildAndroidSettingsMigration({ ruleProviders: [] }, { vpnMode: 'blocked' }, legacy)
  assert.deepEqual(patch.dohProvider, legacy.dohProvider)
  assert.deepEqual(patch.ruleProviders, legacy.ruleProviders)
  assert.equal(patch.vpnMode, undefined, 'first-run seed must not overwrite an existing settings object')

  removeMigratedLegacyKeys(store, legacy.keysToRemove)
  assert.equal(store.data.size, 0)
})

test('unified settings win over stale legacy values', () => {
  const existingProvider = {
    id: 'existing',
    name: 'Existing',
    enabled: true,
    kind: 'url',
    url: 'https://example.com/domains.txt',
    type: 'domain-list',
    action: 'proxy',
    priority: 700,
  } as const
  const store = memoryStore({
    [LEGACY_DNS_PROVIDER_KEY]: JSON.stringify({ id: 'google' }),
    [LEGACY_RULE_LISTS_KEY]: JSON.stringify([{
      id: 'old', name: 'Old', url: 'https://old.example/list', enabled: true,
    }]),
  })
  const legacy = readLegacyAndroidSettings(store)
  const patch = buildAndroidSettingsMigration({
    dohProvider: { id: 'quad9' },
    ruleProviders: [existingProvider],
  }, {}, legacy)

  assert.deepEqual(patch, {})
})

test('first-run seed is applied when no unified settings exist', () => {
  const legacy = readLegacyAndroidSettings(memoryStore({}))
  assert.deepEqual(
    buildAndroidSettingsMigration(null, { vpnMode: 'bypass', utlsFingerprint: 'chrome' }, legacy),
    { vpnMode: 'bypass', utlsFingerprint: 'chrome' },
  )
})
