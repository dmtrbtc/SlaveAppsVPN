import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { SettingsSetSchema } from '../src/shared/ipc/schemas.ts'
const require = createRequire(import.meta.url)
const { SettingsStore } = require('../../../packages/core/dist/cjs/index.js')

test('Windows IPC accepts explicit compatibility opt-in and reset, rejects invalid target', () => {
  assert.deepEqual(SettingsSetSchema.parse({ realityCompatibilityNode: 'synthetic-node' }), { realityCompatibilityNode: 'synthetic-node' })
  assert.deepEqual(SettingsSetSchema.parse({ realityCompatibilityNode: null }), { realityCompatibilityNode: null })
  for (const target of ['', true, [], 'x'.repeat(513)]) {
    assert.equal(SettingsSetSchema.safeParse({ realityCompatibilityNode: target }).success, false)
  }
})

test('shared settings persist opt-in and reset without touching other settings', async () => {
  let saved: unknown
  const storage = { get: async () => saved, set: async (_key: string, value: unknown) => { saved = structuredClone(value) } }
  const store = new SettingsStore(storage)
  await store.load()
  const before = store.getAll()
  await store.patch({ realityCompatibilityNode: 'synthetic-node' })
  const reopened = new SettingsStore(storage)
  await reopened.load()
  assert.equal(reopened.getAll().realityCompatibilityNode, 'synthetic-node')
  await reopened.patch({ realityCompatibilityNode: null })
  assert.deepEqual(reopened.getAll(), { ...before, realityCompatibilityNode: null })
})
