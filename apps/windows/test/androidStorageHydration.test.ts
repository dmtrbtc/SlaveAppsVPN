import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createMirroredStringStore,
  type AsyncStringMirror,
} from '../src/renderer/src/android/adapters/mirrored-string-store.ts'

function fixture(options: {
  localValue?: string | null
  mirrorReads?: Array<string | null | Error>
  localWritable?: boolean
} = {}) {
  const local = new Map<string, string>()
  if (options.localValue !== undefined && options.localValue !== null) local.set('key', options.localValue)
  const mirrored = new Map<string, string>()
  const reads = [...(options.mirrorReads ?? [])]
  const calls = { localGets: 0, localSets: 0, mirrorGets: 0, mirrorSets: 0, mirrorRemoves: 0, delays: [] as number[] }
  const mirror: AsyncStringMirror = {
    async get(key) {
      calls.mirrorGets++
      const next = reads.shift()
      if (next instanceof Error) throw next
      return next === undefined ? (mirrored.get(key) ?? null) : next
    },
    async set(key, value) { calls.mirrorSets++; mirrored.set(key, value) },
    async remove(key) { calls.mirrorRemoves++; mirrored.delete(key) },
  }
  const store = createMirroredStringStore({
    get(key) { calls.localGets++; return local.get(key) ?? null },
    set(key, value) {
      calls.localSets++
      if (options.localWritable === false) return false
      local.set(key, value)
      return true
    },
    remove(key) { local.delete(key) },
  }, mirror, {
    retryDelaysMs: [10, 20, 30],
    delay: async ms => { calls.delays.push(ms) },
  })
  return { store, local, mirrored, reads, calls }
}

test('local value wins without touching Preferences', async () => {
  const f = fixture({ localValue: 'local', mirrorReads: ['mirror'] })
  assert.equal(await f.store.get('key'), 'local')
  assert.equal(f.calls.mirrorGets, 0)
  assert.equal(f.calls.localSets, 0)
})

test('transient null/error results retry and hydrate local storage', async () => {
  const f = fixture({ mirrorReads: [null, new Error('plugin starting'), 'restored'] })
  assert.equal(await f.store.get('key'), 'restored')
  assert.equal(f.local.get('key'), 'restored')
  assert.equal(f.calls.mirrorGets, 3)
  assert.deepEqual(f.calls.delays, [10, 20])
  assert.equal(await f.store.get('key'), 'restored')
  assert.equal(f.calls.mirrorGets, 3)
})

test('parallel reads share a single hydration', async () => {
  let release!: (value: string | null) => void
  const firstRead = new Promise<string | null>(resolve => { release = resolve })
  const f = fixture()
  // Use a dedicated store whose first mirror call can be held open.
  let mirrorGets = 0
  const store = createMirroredStringStore({
    get: key => f.local.get(key) ?? null,
    set: (key, value) => { f.local.set(key, value); return true },
    remove: key => { f.local.delete(key) },
  }, {
    get: async () => { mirrorGets++; return firstRead },
    set: async () => undefined,
    remove: async () => undefined,
  }, { retryDelaysMs: [], delay: async () => undefined })
  const one = store.get('key')
  const two = store.get('key')
  assert.equal(mirrorGets, 1)
  release('restored')
  assert.deepEqual(await Promise.all([one, two]), ['restored', 'restored'])
  assert.equal(mirrorGets, 1)
})

test('bounded retry returns null when the mirror stays unavailable', async () => {
  const f = fixture({ mirrorReads: [null, null, null, null] })
  assert.equal(await f.store.get('key'), null)
  assert.equal(f.calls.mirrorGets, 4)
  assert.deepEqual(f.calls.delays, [10, 20, 30])
})

test('concurrent set wins over a stale mirror read', async () => {
  let release!: (value: string | null) => void
  const mirrorRead = new Promise<string | null>(resolve => { release = resolve })
  const local = new Map<string, string>()
  const store = createMirroredStringStore({
    get: key => local.get(key) ?? null,
    set: (key, value) => { local.set(key, value); return true },
    remove: key => { local.delete(key) },
  }, {
    get: async () => mirrorRead,
    set: async () => undefined,
    remove: async () => undefined,
  }, { retryDelaysMs: [] })
  const pending = store.get('key')
  await store.set('key', 'new')
  release('old')
  assert.equal(await pending, 'new')
  assert.equal(local.get('key'), 'new')
})

test('concurrent remove prevents stale mirror resurrection', async () => {
  let release!: (value: string | null) => void
  const mirrorRead = new Promise<string | null>(resolve => { release = resolve })
  const local = new Map<string, string>()
  const store = createMirroredStringStore({
    get: key => local.get(key) ?? null,
    set: (key, value) => { local.set(key, value); return true },
    remove: key => { local.delete(key) },
  }, {
    get: async () => mirrorRead,
    set: async () => undefined,
    remove: async () => undefined,
  }, { retryDelaysMs: [] })
  const pending = store.get('key')
  store.remove('key')
  release('deleted-value')
  assert.equal(await pending, null)
  assert.equal(local.has('key'), false)
})

test('mirror is best-effort when local writes, but required when local storage fails', async () => {
  const local = fixture()
  await local.store.set('key', 'value')
  await Promise.resolve()
  assert.equal(local.local.get('key'), 'value')
  assert.equal(local.calls.mirrorSets, 1)

  const fallback = fixture({ localWritable: false })
  await fallback.store.set('key', 'value')
  assert.equal(fallback.mirrored.get('key'), 'value')
  assert.equal(fallback.calls.mirrorSets, 1)

  const failed = createMirroredStringStore(
    { get: () => null, set: () => false, remove: () => undefined },
    { get: async () => null, set: async () => { throw new Error('no mirror') }, remove: async () => undefined },
    { retryDelaysMs: [] },
  )
  await assert.rejects(failed.set('key', 'value'), /Both localStorage and Preferences failed/)
})

test('mirror mutations stay ordered when remove follows a slow best-effort set', async () => {
  const local = new Map<string, string>()
  const mirrored = new Map<string, string>()
  let releaseSet!: () => void
  let markSetStarted!: () => void
  let markRemoveFinished!: () => void
  const setGate = new Promise<void>(resolve => { releaseSet = resolve })
  const setStarted = new Promise<void>(resolve => { markSetStarted = resolve })
  const removeFinished = new Promise<void>(resolve => { markRemoveFinished = resolve })
  const store = createMirroredStringStore({
    get: key => local.get(key) ?? null,
    set: (key, value) => { local.set(key, value); return true },
    remove: key => { local.delete(key) },
  }, {
    get: async key => mirrored.get(key) ?? null,
    set: async (key, value) => {
      markSetStarted()
      await setGate
      mirrored.set(key, value)
    },
    remove: async key => {
      mirrored.delete(key)
      markRemoveFinished()
    },
  })

  await store.set('key', 'value')
  await setStarted
  store.remove('key')
  releaseSet()
  await removeFinished

  assert.equal(local.has('key'), false)
  assert.equal(mirrored.has('key'), false)
})
