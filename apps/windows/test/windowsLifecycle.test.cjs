const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

// Load the production service with explicit platform seams. No Electron app,
// credentials, subscription network, or user settings are accessed by these tests.
function loadService(relative, mocks) {
  const filename = path.resolve(__dirname, '../src/main', relative)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = mod.require.bind(mod)
  mod.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) throw new Error(`Unmocked platform dependency: ${name}`)
    return nativeRequire(name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return mod.exports
}
const logger = { info() {}, warn() {}, error() {} }
async function recoveryFixture(t) {
  const { RuntimeManager } = require('@slave-vpn/runtime')
  const { EventEmitter } = require('node:events')
  const events = new EventEmitter()
  let state = 'idle'; let starts = 0; let restarts = 0
  const emitState = next => { state = next; events.emit('stateChanged', { state }) }
  const engine = { initialize: async () => {},
    on: (name, fn) => { events.on(name, fn); return () => events.off(name, fn) },
    getState: () => state,
    start: async () => { starts++; emitState('running') },
    stop: async () => emitState('idle'),
    restart: async () => { restarts++; emitState('running') },
  }
  const manager = new RuntimeManager(() => engine, { autoReconnect: false })
  await manager.initialize('mihomo', {})
  const { RecoveryCoordinator } = loadService('services/RecoveryCoordinator.ts', {
    '../../shared/ipc/channels': { IpcChannel: {} }, '../window': { sendToRenderer() {} },
    '../logger': { getLogger: () => logger },
  })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const coordinator = new RecoveryCoordinator(manager)
  t.after(() => coordinator.dispose())
  const p = { subscriptionYaml: 'proxies: []', vpnMode: 'blocked', generatorSettings: {} }
  coordinator.setConnectFn(() => manager.connect(p))
  await manager.connect(p)
  return { manager, coordinator, engine, events, emitState,
    counts: () => ({ starts, restarts }) }
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
test('explicit disconnect cancels coordinator recovery from error', async t => {
  const f = await recoveryFixture(t)
  f.emitState('error')
  await f.manager.disconnect()
  t.mock.timers.tick(2000); await flush()
  assert.deepEqual(f.counts(), { starts: 1, restarts: 0 })
})
test('Windows crash has one recovery owner, not two restart paths', async t => {
  const f = await recoveryFixture(t)
  f.events.emit('stopped', { reason: 'crashed' }); f.emitState('crashed')
  t.mock.timers.tick(2000); await flush()
  assert.deepEqual(f.counts(), { starts: 2, restarts: 0 })
})
test('disposed coordinator ignores later engine errors', async t => {
  const f = await recoveryFixture(t)
  f.coordinator.dispose(); f.emitState('error')
  t.mock.timers.tick(2000); await flush()
  assert.deepEqual(f.counts(), { starts: 1, restarts: 0 })
})
test('failed recovery retries with backoff and stops after explicit disconnect', async t => {
  const f = await recoveryFixture(t); let attempts = 0
  f.coordinator.setConnectFn(async () => { attempts++; throw new Error('synthetic failure') })
  f.emitState('error'); t.mock.timers.tick(1000); await flush()
  assert.equal(attempts, 1)
  t.mock.timers.tick(1999); await flush(); assert.equal(attempts, 1)
  t.mock.timers.tick(1); await flush(); assert.equal(attempts, 2)
  await f.manager.disconnect(); t.mock.timers.tick(30000); await flush()
  assert.equal(attempts, 2)
})
test('late rejected recovery cannot rearm after dispose', async t => {
  const f = await recoveryFixture(t); let reject; let attempts = 0
  f.coordinator.setConnectFn(() => { attempts++; return new Promise((_, r) => { reject = r }) })
  f.emitState('error'); t.mock.timers.tick(1000); await flush()
  f.coordinator.dispose(); reject(new Error('synthetic failure')); await flush()
  t.mock.timers.tick(30000); await flush(); assert.equal(attempts, 1)
})
function aggregatorFixture(options = {}) {
  let fetches = 0
  let failed = false
  const entries = [{ id: 'one', name: 'Example', type: 'subscription-url', enabled: true }]
  const store = {
    list: () => entries.map(e => ({ ...e })), getInput: id => entries.find(e => e.id === id)?.input ?? 'https://example.test/sub',
    getById: id => entries.find(e => e.id === id), recordFetch() {},
  }
  class Source {
    constructor(input) { this.input = input }
    async fetchYaml() {
      fetches++
      if (options.beforeFetch) await options.beforeFetch()
      if (failed) throw new Error('network unavailable')
      if (options.sourceYaml) return options.sourceYaml(this.input)
      return 'proxies:\n  - {name: Test, type: ss, server: example.test, port: 443, cipher: aes-128-gcm, password: synthetic}'
    }
    invalidateCache() {}
  }
  const { SubscriptionAggregatorService } = loadService('services/SubscriptionAggregatorService.ts', {
    './SubscriptionStore': { getSubscriptionStore: () => store },
    './SettingsStore': { getSettingsStore: () => ({ get: () => '' }) },
    './impl/ConfigSourceService': { getConfigSourceService: () => options.cabinet ?? ({ getMeta: () => null }) },
    './impl/sources/SubscriptionUrlSource': { SubscriptionUrlSource: Source },
    './impl/sources/SingleProxySource': {}, './impl/sources/RemnawaveKeySource': {},
    '../logger': { getLogger: () => logger },
  })
  return { aggregator: new SubscriptionAggregatorService(), fetches: () => fetches,
    fail: () => { failed = true }, entries }
}
test('concurrent snapshot consumers fetch one source once', async () => {
  const f = aggregatorFixture()
  const snapshots = await Promise.all(Array.from({ length: 4 }, () => f.aggregator.getSnapshotOrFetch()))
  assert.equal(f.fetches(), 1)
  assert.equal(new Set(snapshots.map(s => s.hash)).size, 1)
})
test('scheduled refresh followed by consumption does not download source again', async () => {
  const f = aggregatorFixture()
  const initial = await f.aggregator.getSnapshotOrFetch()
  await f.aggregator.refreshOne('one')
  const next = await f.aggregator.getSnapshotOrFetch()
  assert.equal(f.fetches(), 2)
  assert.equal(initial.revision, next.revision)
  assert.equal(initial.hash, next.hash)
})
test('failed refresh preserves last-known-good source nodes', async () => {
  const f = aggregatorFixture()
  await f.aggregator.getSnapshotOrFetch(); f.fail()
  await f.aggregator.refreshOne('one')
  const snapshot = await f.aggregator.getSnapshotOrFetch()
  assert.equal(snapshot.totalProxies, 1)
  assert.equal(snapshot.warnings.length, 1)
})
function runtimeFixture(desired) {
  const { RuntimeManager } = require('@slave-vpn/runtime')
  const settings = { selectedProxy: desired, vpnMode: 'blocked', notificationsEnabled: false }
  const { RuntimeServiceImpl } = loadService('services/impl/RuntimeServiceImpl.ts', {
    electron: { Notification: {} }, '../../../shared/ipc/channels': { IpcChannel: {} },
    '../../window': { sendToRenderer() {} }, './RuntimeEnvironmentValidator': {},
    '../NodeHealthManager': { getNodeHealthManager: () => ({ getQuarantinedNodes: () => [] }) },
    './ConfigSourceService': { getConfigSourceService: () => ({ getServerList: async () => [] }) },
    '../../logger': { getLogger: () => logger },
    '../DnsProfileService': { buildEngineDnsProfile: () => ({ fakeIp: { enabled: false } }) },
    '../RoutingScenarioService': { getRoutingScenarioService: () => ({ composePolicyForMode: () => null }) },
    '../SubscriptionStore': { getSubscriptionStore: () => ({ list: () => [{ enabled: true }] }) }, '../SubscriptionAggregatorService': {},
    './sources/WindowsSystemProxy': {},
  })
  const applied = []
  let state = 'idle'
  const engine = { initialize: async () => {}, on: () => () => {}, getState: () => state,
    getHealth: () => ({ checkedAt: 0 }),
    start: async p => { state = 'running'; applied.push(p) },
    stop: async () => { state = 'idle' },
    updateProfile: async p => { applied.push(p); return 'hot' } }
  const manager = new RuntimeManager(() => engine)
  return (async () => {
    await manager.initialize('mihomo', {})
    const service = new RuntimeServiceImpl({ manager, getSettings: () => settings,
      setSettings: patch => Object.assign(settings, patch) })
    service.fetchSubscriptionYaml = async () => ({ yaml: 'proxies: []', proxyCount: 1, source: 'aggregator' })
    const initial = service.buildDesiredProfile('proxies: []')
    await manager.connect(initial)
    return { service, manager, applied, settings, engine }
  })()
}

test('actual service connect uses freshness and preserves latest mode and selection during resolution', async () => {
  const f = await runtimeFixture('Manual')
  await f.service.disconnect()
  f.service.runPreflight = async () => {}
  let release; let entered
  const started = new Promise(r => { entered = r })
  const gate = new Promise(r => { release = r })
  f.service.fetchSubscriptionYaml = async fresh => {
    assert.equal(fresh, true); entered(); await gate
    return { yaml: 'proxies: []', proxyCount: 1, source: 'aggregator' }
  }
  const pending = f.service.connect()
  await started
  await f.service.setMode('full')
  f.settings.selectedProxy = 'Latest'
  release(); await pending
  assert.equal(f.manager.getCurrentProfile().vpnMode, 'full')
  assert.equal(f.manager.getCurrentProfile().selectedProxy, 'Latest')
})

for (const action of ['stop', 'interval']) test(`scheduler ${action} during fetch does not publish or re-arm old job`, async t => {
  let release; let entered
  const started = new Promise(r => { entered = r })
  const gate = new Promise(r => { release = r })
  const entry = { id: 'one', enabled: true, autoUpdateMinutes: 5 }
  let notifications = 0
  const { SubscriptionScheduler } = loadService('services/SubscriptionScheduler.ts', {
    './SubscriptionStore': { getSubscriptionStore: () => ({ list: () => [entry], getById: () => entry }) },
    './SubscriptionAggregatorService': { getSubscriptionAggregator: () => ({ refreshOne: async () => { entered(); await gate } }) },
    '../logger': { getLogger: () => logger }, '../window': { sendToRenderer: () => { notifications++ } },
    '../../shared/ipc/channels': { IpcChannel: {} }, '../ipc/registry': { services: { has: () => false } },
  })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const scheduler = new SubscriptionScheduler()
  scheduler.start()
  assert.ok(scheduler.describe()[0].nextFireAt - Date.now() <= 30000)
  const pending = scheduler.runJob('one')
  await started
  if (action === 'stop') scheduler.stop()
  else { entry.autoUpdateMinutes = 10; scheduler.reconcile() }
  const expected = scheduler.describe()
  release(); await pending
  assert.deepEqual(scheduler.describe(), expected)
  if (action === 'interval') assert.equal(expected[0].intervalMinutes, 10)
  assert.equal(notifications, 0)
  scheduler.stop()
})

test('IPC validation logging includes correlation but excludes user payload and custom errors', async () => {
  const logs = []
  const { z } = require('zod')
  const { validated } = loadService('security/IpcValidator.ts', {
    '../../shared/ipc/types': { errResult: (code, message) => ({ code, message }) },
    '../logger': { getLogger: () => ({ warn: (...args) => logs.push(args) }) },
  })
  const handler = validated(z.string().refine(() => false, 'synthetic-sensitive-message'), async () => {
    throw new Error('must not run')
  }, 'test-channel')
  await handler({ senderFrame: { url: 'file:///synthetic.html' } }, 'synthetic-sensitive-payload')
  const output = JSON.stringify(logs)
  assert.ok(output.includes('test-channel'))
  assert.ok(output.includes('requestId'))
  assert.ok(!output.includes('synthetic-sensitive'))
})
test('manual target survives immediate refresh with activeProxy null', async () => {
  const { service, manager, applied } = await runtimeFixture('Manual')
  await service.notifySubscriptionsChanged()
  assert.equal(manager.getCurrentProfile().selectedProxy, 'Manual')
  assert.equal(applied.length, 1)
})

test('reconnect refreshes after TTL, ordinary profile updates reuse snapshot', async () => {
  const f = aggregatorFixture()
  await f.aggregator.getSnapshotOrFetch(true)
  await f.aggregator.getSnapshotOrFetch(true)
  assert.equal(f.fetches(), 1)
  f.aggregator.fetchedAt.set('one', Date.now() - 300001)
  await f.aggregator.getSnapshotOrFetch()
  assert.equal(f.fetches(), 1)
  await f.aggregator.getSnapshotOrFetch(true)
  assert.equal(f.fetches(), 2)
})

test('cabinet source instance survives TTL and is fetched once per fresh snapshot', async () => {
  let creations = 0; let fetches = 0
  const f = aggregatorFixture({ cabinet: { getMeta: () => ({ displayName: 'Cabinet' }),
    createConfigSource: () => { creations++; return { fetchYaml: async () => { fetches++; return 'proxies: []' } } } } })
  await f.aggregator.getSnapshotOrFetch(true)
  await f.aggregator.getSnapshotOrFetch(true)
  assert.equal(fetches, 1)
  f.aggregator.cabinetFetchedAt = Date.now() - 300001
  await f.aggregator.getSnapshotOrFetch(true)
  assert.equal(fetches, 2)
  assert.equal(creations, 1)
})

test('disabled sources are skipped by manual refresh all and refresh one', async () => {
  const f = aggregatorFixture()
  f.entries.push({ ...f.entries[0], id: 'disabled', enabled: false })
  await f.aggregator.refreshAll()
  await f.aggregator.refreshOne('disabled')
  assert.equal(f.fetches(), 1)
})

test('removal during source fetch does not resurrect cached nodes', async () => {
  let release; let entered
  const started = new Promise(r => { entered = r })
  const gate = new Promise(r => { release = r })
  const f = aggregatorFixture({ beforeFetch: async () => { entered(); await gate } })
  const pending = f.aggregator.getSnapshotOrFetch()
  await started
  f.entries.length = 0
  f.aggregator.invalidate('one')
  release()
  await assert.rejects(pending, /No enabled subscriptions/)
  assert.equal(f.aggregator.cachedResults.has('one'), false)
})

test('older selection completion cannot overwrite newer user intent', async () => {
  const f = await runtimeFixture('Manual')
  let release
  const gate = new Promise(r => { release = r })
  let count = 0
  f.service.applyDesiredProfile = async () => { if (++count === 1) await gate }
  const older = f.service.setSelectedProxy('Older')
  await f.service.setSelectedProxy('Newer')
  release(); await older
  assert.equal(f.settings.selectedProxy, 'Newer')
  assert.equal(f.service.activeProxy, 'Newer')
})

for (const change of ['disconnect', 'selection']) {
  test(`active discovery ignores response after ${change}`, async t => {
    const f = await runtimeFixture('Manual')
    f.service.apiSecret = 'synthetic'
    let release; let entered
    const started = new Promise(r => { entered = r })
    const gate = new Promise(r => { release = r })
    t.mock.method(globalThis, 'fetch', async () => {
      entered(); await gate
      return { ok: true, json: async () => ({ now: 'Stale' }) }
    })
    const pending = f.service.refreshActiveProxy()
    await started
    if (change === 'disconnect') ++f.service.connectionEpoch
    else ++f.service.selectionRevision
    release(); await pending
    assert.equal(f.service.activeProxy, null)
  })
}
test('AUTO desired target is never replaced by observed leaf', async () => {
  const { service, manager, applied } = await runtimeFixture('SLAVE-AUTO')
  service.activeProxy = 'Observed leaf'
  await service.notifySubscriptionsChanged()
  assert.equal(manager.getCurrentProfile().selectedProxy, 'SLAVE-AUTO')
  assert.equal(applied.length, 1)
})
for (const change of ['disconnect', 'selection']) test(`connectivity snapshot is discarded after ${change} during HTTP`, async t => {
  const f = await runtimeFixture('Manual'); f.service.apiSecret = 'synthetic'
  f.engine.getHealth = () => ({ checkedAt: 1, apiResponding: true, connectivityOk: true })
  let release; let entered
  const started = new Promise(r => { entered = r }); const gate = new Promise(r => { release = r })
  t.mock.method(globalThis, 'fetch', async () => { entered(); await gate; return { ok: true, json: async () => ({ now: 'Stale', all: ['Stale'] }) } })
  const pending = f.service.getConnectivity(); await started
  if (change === 'disconnect') await f.service.disconnect()
  else await f.service.setSelectedProxy('Newer')
  release(); assert.equal(await pending, null)
})
test('concurrent real service mode, selection and refresh converge to latest desired profile', async () => {
  const f = await runtimeFixture('Manual'); let release; let entered; let calls = 0
  const started = new Promise(r => { entered = r }); const gate = new Promise(r => { release = r })
  f.engine.updateProfile = async p => { f.applied.push(p); if (++calls === 1) { entered(); await gate } return 'hot' }
  const mode = f.service.setMode('full'); await started
  const selection = f.service.setSelectedProxy('Latest')
  const refresh = f.service.notifySubscriptionsChanged('synthetic-refresh')
  release(); await Promise.all([mode, selection, refresh])
  assert.equal(f.manager.getCurrentProfile().selectedProxy, 'Latest')
  assert.equal(f.manager.getCurrentProfile().vpnMode, 'full')
  assert.equal(calls, 2)
})

test('URL source uses real loopback HTTP validators, 304 and offline last-good fallback', async t => {
  const http = require('node:http')
  const requests = []; let mode = 'valid'
  const yaml = 'proxies:\n  - {name: Synthetic, type: hysteria2, server: example.test, port: 443, password: synthetic}'
  const server = http.createServer((req, res) => {
    requests.push(req.headers)
    if (mode === 'offline') { req.socket.destroy(); return }
    if (mode === '304') { res.writeHead(304); res.end(); return }
    res.writeHead(200, { ETag: '"fixture-v1"', 'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT' })
    res.end(mode === 'invalid' ? '<html>invalid synthetic subscription</html>' : yaml)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const { SubscriptionUrlSource } = loadService('services/impl/sources/SubscriptionUrlSource.ts', {
    './subscriptionHeaders': { buildSubscriptionHeaders: ua => ({ 'User-Agent': ua }) },
    '../../../logger': { getLogger: () => logger },
  })
  const source = new SubscriptionUrlSource(`http://127.0.0.1:${server.address().port}/synthetic`)
  const first = await source.fetchYaml()
  assert.equal(source.getCachedProxyCount(), 1)
  await source.fetchYaml(); assert.equal(requests.length, 1)
  mode = '304'; source.invalidateCache()
  assert.equal(await source.fetchYaml(), first)
  assert.equal(requests[1]['if-none-match'], '"fixture-v1"')
  assert.equal(requests[1]['if-modified-since'], 'Mon, 01 Jan 2024 00:00:00 GMT')
  mode = 'invalid'; source.invalidateCache(); assert.equal(await source.fetchYaml(), first)
  mode = 'offline'; source.invalidateCache(); assert.equal(await source.fetchYaml(), first)
  assert.equal(source.getCachedProxyCount(), 1)
})

for (const mutation of ['replace', 'disable', 'reorder']) {
  test(`${mutation} during fetch publishes only current subscription projection`, async () => {
    let release; let entered
    const started = new Promise(r => { entered = r }); const gate = new Promise(r => { release = r })
    const f = aggregatorFixture({ beforeFetch: async () => { entered(); await gate },
      sourceYaml: input => `proxies:\n  - {name: ${input.endsWith('new') ? 'New' : 'Old'}, type: ss, server: ${input.endsWith('new') ? 'new' : 'old'}.test, port: 443, cipher: aes-128-gcm, password: synthetic}` })
    f.entries.push({ ...f.entries[0], id: 'two', input: 'https://example.test/new' })
    const pending = f.aggregator.getSnapshotOrFetch(); await started
    if (mutation === 'replace') { f.entries[0].input = 'https://example.test/new'; f.aggregator.invalidate('one') }
    if (mutation === 'disable') { f.entries[0].enabled = false; f.aggregator.invalidateSnapshot() }
    if (mutation === 'reorder') { f.entries.reverse(); f.aggregator.invalidateSnapshot() }
    release(); const result = await pending
    const { parseProxiesFromYaml } = require('@slave-vpn/config')
    const proxies = parseProxiesFromYaml(result.yaml)
    assert.equal(proxies[0].server, 'new.test')
    assert.equal(proxies.length, mutation === 'reorder' ? 2 : 1)
  })
}
test('cabinet replacement during fetch discards old cabinet nodes and instance', async () => {
  let release; let entered; let version = 'Old'; let creations = 0
  const started = new Promise(r => { entered = r }); const gate = new Promise(r => { release = r })
  const f = aggregatorFixture({ cabinet: { getMeta: () => ({ displayName: version }), createConfigSource: () => {
    creations++; const captured = version
    return { fetchYaml: async () => { entered(); await gate
      return `proxies:\n  - {name: ${captured}, type: ss, server: ${captured.toLowerCase()}.test, port: 443, cipher: aes-128-gcm, password: synthetic}` } }
  } } })
  const pending = f.aggregator.getSnapshotOrFetch(); await started
  version = 'New'; f.aggregator.invalidateConfigSource(); release()
  const result = await pending
  assert.ok(result.yaml.includes('new.test')); assert.ok(!result.yaml.includes('old.test'))
  assert.equal(creations, 2)
})
