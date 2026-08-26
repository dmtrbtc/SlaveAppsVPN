import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createCore, CoreNotReadyError } = require('../dist/cjs/index.js') as {
  createCore: (adapters: Record<string, unknown>, options?: Record<string, unknown>) => {
    vpn: Record<string, (...args: unknown[]) => Promise<unknown>>
    events: Record<string, (cb: (value: unknown) => void) => () => void>
    dispose(): Promise<void>
  }
  CoreNotReadyError: new (...args: unknown[]) => Error
}

function fixture(options: {
  config?: string
  restoreCached?: boolean
  modeController?: boolean
  statusState?: string
  logger?: boolean
  compileError?: string
  probeTargets?: Array<{ name: string; server: string; port: number }>
  probeLatencies?: Record<string, number | null | Error>
  probeConcurrency?: number
} = {}) {
  const calls: Array<[string, ...unknown[]]> = []
  let eventHandler: ((event: unknown) => void) | null = null
  const status = { state: options.statusState ?? 'connected', mode: 'blocked' }
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
    ...(options.restoreCached !== undefined
      ? {
          restoreCached: async () => {
            calls.push(['restoreCached'])
            return options.restoreCached ?? false
          },
        }
      : {}),
  }
  const coreOptions = {
    reconnectDelayMs: 0,
    ...(options.config !== undefined || options.compileError !== undefined
      ? {
          configProvider: {
            compile: async () => {
              calls.push(['compile'])
              if (options.compileError) throw new Error(options.compileError)
              return options.config
            },
          },
        }
      : {}),
    ...(options.modeController
      ? {
          modeController: {
            setMode: async (mode: string) => { calls.push(['setMode', mode]) },
          },
        }
      : {}),
    ...(options.probeTargets
      ? {
          probeProvider: {
            listTargets: async () => {
              calls.push(['listProbeTargets'])
              return options.probeTargets
            },
            probe: async (target: { name: string }) => {
              calls.push(['probe', target.name])
              const value = options.probeLatencies?.[target.name] ?? null
              if (value instanceof Error) throw value
              return value
            },
            concurrency: options.probeConcurrency ?? 1,
          },
        }
      : {}),
  }
  const logger = options.logger
    ? {
        debug: (message: string) => { calls.push(['log.debug', message]) },
        info: (message: string) => { calls.push(['log.info', message]) },
        warn: (message: string) => { calls.push(['log.warn', message]) },
        error: (message: string, metadata?: Record<string, unknown>) => {
          calls.push(['log.error', message, metadata?.['error']])
        },
      }
    : undefined
  const facade = createCore({ engine, storage: {}, network: {}, fs: {}, logger }, coreOptions)
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

test('connect compiles config and starts the engine through the facade', async () => {
  const { facade, calls } = fixture({ config: 'mixed-port: 7890', restoreCached: false })

  await facade.vpn.connect()

  assert.deepEqual(calls, [
    ['restoreCached'],
    ['compile'],
    ['start', 'mixed-port: 7890'],
  ])
})

test('connect recovery skips config compilation when the cached engine config starts', async () => {
  const { facade, calls } = fixture({ config: 'must-not-be-used', restoreCached: true })

  await facade.vpn.connect()

  assert.deepEqual(calls, [['restoreCached']])
})

test('connect reports the same lifecycle diagnostics on failures', async () => {
  const { facade, calls } = fixture({ compileError: 'subscription unavailable', logger: true })

  await assert.rejects(() => facade.vpn.connect(), /subscription unavailable/)

  assert.deepEqual(calls, [
    ['log.debug', 'vpn.connect.start'],
    ['compile'],
    ['log.error', 'vpn.connect.failed', 'subscription unavailable'],
  ])
})

test('setMode restarts a connected engine through the same connect orchestration', async () => {
  const { facade, calls } = fixture({
    config: 'mode: rule',
    restoreCached: false,
    modeController: true,
  })

  await facade.vpn.setMode('full')

  assert.deepEqual(calls, [
    ['setMode', 'full'],
    ['getStatus'],
    ['stop'],
    ['restoreCached'],
    ['compile'],
    ['start', 'mode: rule'],
  ])
})

test('setMode persists a disconnected mode without starting the engine', async () => {
  const { facade, calls } = fixture({
    config: 'must-not-be-used',
    modeController: true,
    statusState: 'disconnected',
  })

  await facade.vpn.setMode('bypass')

  assert.deepEqual(calls, [
    ['setMode', 'bypass'],
    ['getStatus'],
  ])
})

test('probeAll owns target iteration and emits live latency results', async () => {
  const { facade, calls } = fixture({
    statusState: 'disconnected',
    probeTargets: [
      { name: 'node-a', server: 'a.example', port: 443 },
      { name: 'node-b', server: 'b.example', port: 8443 },
    ],
    probeLatencies: { 'node-a': 42, 'node-b': 84 },
  })
  const received: unknown[] = []
  const unsubscribe = facade.events.onServerLatency((result: unknown) => { received.push(result) })

  await facade.vpn.probeAll()

  assert.deepEqual(calls, [
    ['listProbeTargets'],
    ['probe', 'node-a'],
    ['probe', 'node-b'],
  ])
  assert.deepEqual(received, [
    { proxyName: 'node-a', latencyMs: 42, success: true },
    { proxyName: 'node-b', latencyMs: 84, success: true },
  ])
  unsubscribe()
})

test('probeAll isolates per-target failures and normalizes invalid latency', async () => {
  const { facade } = fixture({
    probeTargets: [
      { name: 'failed', server: 'failed.example', port: 443 },
      { name: 'invalid', server: 'invalid.example', port: 443 },
      { name: 'healthy', server: 'healthy.example', port: 443 },
    ],
    probeLatencies: {
      failed: new Error('timeout'),
      invalid: -1,
      healthy: 21,
    },
  })
  const received: unknown[] = []
  facade.events.onServerLatency((result: unknown) => { received.push(result) })

  await assert.doesNotReject(() => facade.vpn.probeAll())

  assert.deepEqual(received, [
    { proxyName: 'failed', latencyMs: null, success: false },
    { proxyName: 'invalid', latencyMs: null, success: false },
    { proxyName: 'healthy', latencyMs: 21, success: true },
  ])
})

test('probeAll handles an empty target list without touching the engine', async () => {
  const { facade, calls } = fixture({ probeTargets: [], statusState: 'disconnected' })
  const received: unknown[] = []
  facade.events.onServerLatency((value) => { received.push(value) })

  await facade.vpn.probeAll()

  assert.deepEqual(calls, [['listProbeTargets']])
  assert.deepEqual(received, [])
})

test('probeAll bounds concurrency and shares simultaneous calls', async () => {
  let listCalls = 0
  let active = 0
  let maxActive = 0
  const probed: string[] = []
  const targets = Array.from({ length: 5 }, (_, i) => ({ name: `node-${i}`, server: 'example.test', port: 443 }))
  const facade = createCore({ engine: {}, storage: {}, network: {}, fs: {} }, {
    probeProvider: {
      listTargets: async () => { listCalls++; return targets },
      concurrency: 2,
      probe: async (target: { name: string }) => {
        probed.push(target.name)
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setImmediate(resolve))
        active--
        return 10
      },
    },
  })
  const received: unknown[] = []
  facade.events.onServerLatency((value) => { received.push(value) })

  const first = facade.vpn.probeAll()
  const second = facade.vpn.probeAll()
  assert.equal(first, second)
  await Promise.all([first, second])

  assert.equal(listCalls, 1)
  assert.equal(maxActive, 2)
  assert.deepEqual(probed, targets.map((target) => target.name))
  assert.equal(received.length, targets.length)
  await facade.vpn.probeAll()
  assert.equal(listCalls, 2, 'a later request must run a fresh batch')
})

test('probeAll propagates target-list errors and permits a retry', async () => {
  let attempts = 0
  const facade = createCore({ engine: {}, storage: {}, network: {}, fs: {} }, {
    probeProvider: {
      listTargets: async () => {
        if (++attempts === 1) throw new Error('subscriptions unavailable')
        return []
      },
      probe: async () => assert.fail('no targets to probe'),
    },
  })

  await assert.rejects(() => facade.vpn.probeAll(), /subscriptions unavailable/)
  await assert.doesNotReject(() => facade.vpn.probeAll())
  assert.equal(attempts, 2)
})

test('invalid concurrency values still process every target', async () => {
  for (const concurrency of [0, -1, 1.5, NaN, Infinity]) {
    const { facade, calls } = fixture({
      probeTargets: [{ name: 'node-a', server: 'a.example', port: 443 }],
      probeConcurrency: concurrency,
    })
    await facade.vpn.probeAll()
    assert.deepEqual(calls, [['listProbeTargets'], ['probe', 'node-a']])
  }
})

test('latency events support independent subscribers, errors and cleanup', async () => {
  const { facade } = fixture({
    probeTargets: [{ name: 'node-a', server: 'a.example', port: 443 }],
    probeLatencies: { 'node-a': 0 },
  })
  const received: unknown[] = []
  const handler = (value: unknown) => { received.push(value) }
  const unsubscribe = facade.events.onServerLatency(handler)
  facade.events.onServerLatency(() => { throw new Error('broken observer') })
  facade.events.onServerLatency(handler)

  await facade.vpn.probeAll()
  assert.equal(received.length, 2)
  assert.deepEqual(received[0], { proxyName: 'node-a', latencyMs: 0, success: true })

  unsubscribe()
  unsubscribe()
  await facade.vpn.probeAll()
  assert.equal(received.length, 3, 'removing one registration must preserve the other')

  await facade.dispose()
  await facade.vpn.probeAll()
  assert.equal(received.length, 3, 'dispose must release all latency subscriptions')
})

test('unwired orchestration methods fail explicitly', async () => {
  const { facade } = fixture()

  await assert.rejects(() => facade.vpn.connect(), CoreNotReadyError)
  await assert.rejects(() => facade.vpn.setMode('full'), CoreNotReadyError)
  await assert.rejects(() => facade.vpn.probeAll(), CoreNotReadyError)
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
