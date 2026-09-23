import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { JsonFileStorageAdapter } from '../src/main/services/JsonFileStorageAdapter.ts'

const STORAGE_KEY = 'slave.settings.v1'
const require = createRequire(import.meta.url)

test('reads the legacy flat settings.json shape without a migration envelope', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'slavevpn-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const filePath = join(dir, 'settings.json')
  await writeFile(filePath, JSON.stringify({ language: 'en', vpnMode: 'full' }), 'utf-8')
  const adapter = new JsonFileStorageAdapter(filePath, STORAGE_KEY)

  assert.deepEqual(await adapter.get(STORAGE_KEY), { language: 'en', vpnMode: 'full' })
  assert.deepEqual(await adapter.keys('slave.settings'), [STORAGE_KEY])
})

test('writes the settings object at the JSON root and replaces the prior file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'slavevpn-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const filePath = join(dir, 'settings.json')
  const adapter = new JsonFileStorageAdapter(filePath, STORAGE_KEY)

  await adapter.set(STORAGE_KEY, { language: 'ru', vpnMode: 'blocked' })
  await adapter.set(STORAGE_KEY, { language: 'en', vpnMode: 'full' })

  const disk = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
  assert.deepEqual(disk, { language: 'en', vpnMode: 'full' })
  assert.equal(STORAGE_KEY in disk, false)
})

test('rejects writes outside the configured settings key', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'slavevpn-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const adapter = new JsonFileStorageAdapter(join(dir, 'settings.json'), STORAGE_KEY)

  await assert.rejects(adapter.set('unexpected', {}), /Unsupported JSON storage key/)
})

test('shared store recovers from missing/corrupt files and reloads saved flat settings', async (t) => {
  const { SettingsStore } = require('@slave-vpn/core')
  const dir = await mkdtemp(join(tmpdir(), 'slavevpn-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const filePath = join(dir, 'settings.json')
  const adapter = new JsonFileStorageAdapter(filePath, STORAGE_KEY)
  const missing = new SettingsStore(adapter)
  assert.equal((await missing.load()).vpnMode, 'blocked')
  await writeFile(filePath, '{broken', 'utf-8')
  const recovered = new SettingsStore(adapter)
  assert.equal((await recovered.load()).vpnMode, 'blocked')
  await recovered.patch({ language: 'en', splitProcessList: ['synthetic.exe'] })
  const restarted = new SettingsStore(adapter)
  const loaded = await restarted.load()
  assert.equal(loaded.language, 'en')
  assert.deepEqual(loaded.splitProcessList, ['synthetic.exe'])
})

test('updater waits for channel persistence and propagates write failure', async () => {
  const ts = require('typescript')
  const source = await readFile(new URL('../src/main/services/UpdateService.ts', import.meta.url), 'utf-8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  let release!: () => void
  let reject!: (error: Error) => void
  const autoUpdater = { allowPrerelease: false, channel: 'latest' }
  const mod = { exports: {} as any }
  const mocks: Record<string, unknown> = {
    electron: { app: { getVersion: () => '0.0.0' } },
    'electron-updater': { autoUpdater },
    '../../shared/ipc/channels': { IpcChannel: {} },
    '../window': {}, '../logger': {},
    './SettingsStore': { getSettingsStore: () => ({
      patch: () => new Promise<void>((resolve, fail) => { release = resolve; reject = fail }),
    }) },
  }
  new Function('require', 'module', 'exports', code)((id: string) => {
    assert.ok(id in mocks, `Unexpected module: ${id}`)
    return mocks[id]
  }, mod, mod.exports)
  const service = new mod.exports.UpdateService()
  const pending = service.setChannel('beta')
  assert.equal(service.getStatus().channel, 'stable')
  release()
  await pending
  assert.equal(autoUpdater.allowPrerelease, true)
  const failed = service.setChannel('stable')
  reject(new Error('synthetic write failure'))
  await assert.rejects(failed, /synthetic write failure/)
  assert.equal(service.getStatus().channel, 'beta')
  assert.equal(autoUpdater.allowPrerelease, true)
})
