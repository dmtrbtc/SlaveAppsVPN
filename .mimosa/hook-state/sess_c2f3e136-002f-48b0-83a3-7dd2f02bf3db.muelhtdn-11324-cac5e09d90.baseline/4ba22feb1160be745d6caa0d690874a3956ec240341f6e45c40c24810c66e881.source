import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type { AppSettings, StorageAdapter } from '../src/index.ts'

const require = createRequire(import.meta.url)
const { SettingsStore, SETTINGS_STORAGE_KEY, createDefaultSettings } =
  require('../dist/cjs/index.js') as typeof import('../src/index.ts')

function memoryAdapter(initial: Partial<AppSettings> | null = null): {
  adapter: StorageAdapter
  read: () => Partial<AppSettings> | null
} {
  let value = initial
  return {
    adapter: {
      async get<T>(key: string): Promise<T | null> {
        return key === SETTINGS_STORAGE_KEY ? (value as T | null) : null
      },
      async set<T>(key: string, next: T): Promise<void> {
        assert.equal(key, SETTINGS_STORAGE_KEY)
        value = next as Partial<AppSettings>
      },
      async remove(): Promise<void> {
        value = null
      },
      async keys(): Promise<string[]> {
        return value === null ? [] : [SETTINGS_STORAGE_KEY]
      },
    },
    read: () => value,
  }
}

test('loads a legacy partial snapshot over shared defaults', async () => {
  const storage = memoryAdapter({ language: 'en', vpnMode: 'full' })
  const store = new SettingsStore(storage.adapter)

  const loaded = await store.load()

  assert.equal(loaded.language, 'en')
  assert.equal(loaded.vpnMode, 'full')
  assert.equal(loaded.dnsPreset, createDefaultSettings().dnsPreset)
  assert.deepEqual(loaded.ruleProviders, [])
})

test('patch drops undefined values and persists the complete snapshot', async () => {
  const storage = memoryAdapter()
  const store = new SettingsStore(storage.adapter)
  await store.load()

  const updated = await store.patch({ language: 'en', vpnMode: undefined })
  const persisted = storage.read() as AppSettings

  assert.equal(updated.language, 'en')
  assert.equal(updated.vpnMode, 'blocked')
  assert.deepEqual(persisted, updated)
})

test('serialises concurrent writes so the newest snapshot stays durable', async () => {
  let persisted: AppSettings | null = null
  let releaseFirst!: () => void
  const firstWriteGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let writes = 0
  const adapter: StorageAdapter = {
    async get(): Promise<null> {
      return null
    },
    async set<T>(_key: string, value: T): Promise<void> {
      writes += 1
      if (writes === 1) await firstWriteGate
      persisted = value as AppSettings
    },
    async remove(): Promise<void> {
      /* no-op */
    },
    async keys(): Promise<string[]> {
      return []
    },
  }
  const store = new SettingsStore(adapter)
  await store.load()

  const first = store.patch({ language: 'en' })
  const second = store.patch({ vpnMode: 'full' })
  releaseFirst()
  await Promise.all([first, second])

  assert.equal(writes, 2)
  assert.equal(persisted?.language, 'en')
  assert.equal(persisted?.vpnMode, 'full')
})

test('isolates nested patch inputs, reads and queued snapshots', async () => {
  const storage = memoryAdapter()
  const store = new SettingsStore(storage.adapter)
  await store.load()
  const processes = ['first.exe']
  const pending = store.patch({ splitProcessList: processes })
  processes.push('external.exe')
  store.getAll().splitProcessList.push('read-copy.exe')
  store.get('splitProcessList').push('get-copy.exe')
  await pending
  assert.deepEqual(store.get('splitProcessList'), ['first.exe'])
  assert.deepEqual(storage.read()?.splitProcessList, ['first.exe'])
})

test('reset preserves default nested values and stays ordered with patches', async () => {
  const storage = memoryAdapter()
  const defaults = createDefaultSettings()
  const store = new SettingsStore(storage.adapter, defaults)
  defaults.splitProcessList.push('external.exe')
  const first = store.patch({ splitProcessList: ['first.exe'] })
  const reset = store.reset()
  const last = store.patch({ language: 'en' })
  await Promise.all([first, reset, last])
  assert.deepEqual(storage.read()?.splitProcessList, [])
  assert.equal(storage.read()?.language, 'en')
})

test('reports a failed write and allows the next complete snapshot to persist', async () => {
  const storage = memoryAdapter()
  const save = storage.adapter.set.bind(storage.adapter)
  let fail = true
  storage.adapter.set = async (key, value) => {
    if (fail) { fail = false; throw new Error('synthetic write failure') }
    await save(key, value)
  }
  const store = new SettingsStore(storage.adapter)
  await store.load()
  await assert.rejects(store.patch({ language: 'en' }), /synthetic write failure/)
  await store.patch({ vpnMode: 'full' })
  assert.equal(storage.read()?.language, 'en')
  assert.equal(storage.read()?.vpnMode, 'full')
})
