import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCore, CoreNotReadyError } = require('../dist/cjs/index.js') as {
  createCore: (adapters: Record<string, unknown>) => {
    vpn: Record<string, (...args: unknown[]) => Promise<unknown>>
    events: Record<string, (cb: (value: unknown) => void) => () => void>
    dispose(): Promise<void>
  }
  CoreNotReadyError: new (...args: unknown[]) => Error
}

function fixture() {
  const calls: Array<[string, ...unknown[]]> = []
  let eventHandler: ((event: unknown) => void) | null = null
  const status = { state: 'connected', mode: 'blocked' }
  const traffic = { downloadBytes: 42 }
  const proxies = [{ name: 'node-a' }]
  const connections = { count: 1, connections: [{ id: 'conn-a' }] }

  const engine = {
    start: async (config: string) => { calls.push(['start', config]) },
    stop: async () => { calls.push(['stop']) },
    getStatus: async () => { calls.push(['getStatus']); return status },
    getTraffic: async () => { calls.push(['getTraffic']); return traffic },
    getProxies: async () => { calls.push(['getProxies']); return proxies },
    setProxy: async (name: string) => { calls.push(['setProxy', name]) },
    getConnections: async () => { calls.push(['getConnections']); return connections },
    closeConnection: async (id: string) => { calls.push(['closeConnection', id]) },
    probeLatency: async () => null,
    geositeCategories: async () => [],
    onEvent: (handler: (event: unknown) => void) => {
      eventHandler = handler
      calls.push(['subscribe'])
      return () => { calls.push(['unsubscribe']) }
    },
  }
  const facade = createCore({ engine, storage: {}, network: {}, fs: {} })
  return {
    facade,
    calls,
    values: { status, traffic, proxies, connections },
    emit: (event: unknown) => {
      assert.ok(eventHandler, 'runtime event handler must be registered')
      eventHandler(event)
    },
  }
}

test('CoreFacade delegates engine pass-through operations without reshaping values', async () => {
  const { facade, calls, values } = fixture()

  assert.equal(await facade.vpn.getStatus(), values.status)
  assert.equal(await facade.vpn.getTraffic(), values.traffic)
  assert.equal(await facade.vpn.getProxyList(), values.proxies)
  assert.equal(await facade.vpn.getConnections(), values.connections)
  await facade.vpn.setProxy('node-b')
  await facade.vpn.closeConnection('conn-b')
  await facade.vpn.disconnect()

  assert.deepEqual(calls, [
    ['getStatus'],
    ['getTraffic'],
    ['getProxies'],
    ['getConnections'],
    ['setProxy', 'node-b'],
    ['closeConnection', 'conn-b'],
    ['stop'],
  ])
})

test('status stream refreshes only for VPN lifecycle runtime events', async () => {
  const { facade, calls, values, emit } = fixture()
  const received: unknown[] = []
  const unsubscribe = facade.events.onStatus((status: unknown) => { received.push(status) })

  emit({ kind: 'proxy.selected' })
  emit({ kind: 'vpn.connected' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(received, [values.status])
  assert.deepEqual(calls, [['subscribe'], ['getStatus']])
  unsubscribe()
  assert.deepEqual(calls.at(-1), ['unsubscribe'])
})

test('unmigrated orchestration methods fail explicitly', () => {
  const { facade } = fixture()

  assert.throws(() => facade.vpn.connect(), CoreNotReadyError)
  assert.throws(() => facade.vpn.setMode('full'), CoreNotReadyError)
  assert.throws(() => facade.vpn.probeAll(), CoreNotReadyError)
})

test('dispose attempts to stop the engine and absorbs shutdown errors', async () => {
  const { facade, calls } = fixture()
  await facade.dispose()
  assert.deepEqual(calls, [['stop']])

  const failing = createCore({
    storage: {}, network: {}, fs: {},
    engine: {
      stop: async () => { throw new Error('already stopped') },
    },
  })
  await assert.doesNotReject(() => failing.dispose())
})

test('dispose releases active engine event subscriptions before stopping', async () => {
  const { facade, calls } = fixture()
  facade.events.onRuntimeEvent(() => undefined)

  await facade.dispose()

  assert.deepEqual(calls, [['subscribe'], ['unsubscribe'], ['stop']])
})
