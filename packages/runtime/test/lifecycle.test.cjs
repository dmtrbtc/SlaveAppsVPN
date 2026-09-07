const { test } = require('node:test')
const assert = require('node:assert/strict')
const { RuntimeManager } = require('../dist/RuntimeManager')

const profile = (selectedProxy = 'SLAVE-AUTO') => ({
  subscriptionYaml: 'proxies: []', selectedProxy, vpnMode: 'blocked',
  generatorSettings: { tunEnabled: true, tunStack: 'mixed', mixedPort: 7890,
    fakeIpEnabled: true, dnsOverHttps: 'https://example.test/dns-query', fallbackDns: [] },
})
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
async function setup() {
  const calls = []
  const engine = {
    getState: () => 'running',
    initialize: async () => {}, on: () => () => {},
    start: async p => { calls.push(['start', p]) },
    updateProfile: async p => { calls.push(['update', p]); return 'reconnect' },
    stop: async () => { calls.push(['stop']) },
    dispose: async () => {},
  }
  const manager = new RuntimeManager(() => engine)
  await manager.initialize('mihomo', {})
  await manager.connect(profile())
  return { manager, engine, calls }
}
test('clean connect and duplicate notifications cause one start and zero reloads', async () => {
  const { manager, calls } = await setup()
  const results = await Promise.all(Array.from({ length: 5 }, () => manager.updateProfile(profile())))
  assert.deepEqual(results, ['none', 'none', 'none', 'none', 'none'])
  assert.deepEqual(calls.map(c => c[0]), ['start'])
})
test('concurrent different updates are serialized and latest state wins', async () => {
  const { manager, engine } = await setup()
  const gate = deferred(); const entered = deferred()
  let active = 0; let maximum = 0; const selected = []
  engine.updateProfile = async p => {
    maximum = Math.max(maximum, ++active)
    selected.push(p.selectedProxy)
    if (selected.length === 1) { entered.resolve(); await gate.promise }
    active--; return 'hot'
  }
  const a = manager.updateProfile(profile('A'))
  await entered.promise
  const b = manager.updateProfile(profile('B'))
  gate.resolve(); await Promise.all([a, b])
  assert.equal(maximum, 1)
  assert.deepEqual(selected, ['A', 'B'])
  assert.equal(manager.getCurrentProfile().selectedProxy, 'B')
})
test('failed reload retains last good profile and does not poison queue', async () => {
  const { manager, engine } = await setup()
  engine.updateProfile = async () => { throw new Error('reload failed') }
  await assert.rejects(manager.updateProfile(profile('A')), /reload failed/)
  assert.equal(manager.getCurrentProfile().selectedProxy, 'SLAVE-AUTO')
  engine.updateProfile = async () => 'hot'
  await manager.updateProfile(profile('B'))
  assert.equal(manager.getCurrentProfile().selectedProxy, 'B')
})
test('disconnect waits for active reload and cancels queued stale updates', async () => {
  const { manager, engine, calls } = await setup()
  const gate = deferred(); const entered = deferred()
  engine.updateProfile = async p => {
    calls.push(['update', p]); entered.resolve(); await gate.promise; return 'hot'
  }
  const a = manager.updateProfile(profile('A'))
  await entered.promise
  const b = manager.updateProfile(profile('B'))
  const stop = manager.disconnect()
  assert.equal(calls.some(c => c[0] === 'stop'), false)
  gate.resolve(); await Promise.all([a, b, stop])
  assert.deepEqual(calls.map(c => c[0]), ['start', 'update', 'stop'])
  assert.equal(manager.getCurrentProfile(), null)
})
test('queued profile is immutable and getters cannot mutate applied state', async () => {
  const { manager } = await setup()
  const next = profile('A')
  const operation = manager.updateProfile(next)
  next.selectedProxy = 'B'
  await operation
  const snapshot = manager.getCurrentProfile(); snapshot.selectedProxy = 'C'
  assert.equal(manager.getCurrentProfile().selectedProxy, 'A')
})
test('real routing mode change is applied', async () => {
  const { manager, calls } = await setup()
  await manager.updateProfile({ ...profile(), vpnMode: 'full' })
  assert.equal(calls.length, 2)
  assert.equal(manager.getCurrentProfile().vpnMode, 'full')
})
test('YAML comments, mapping order and flow formatting do not trigger reload', async () => {
  const { manager, calls } = await setup()
  await manager.updateProfile({ ...profile(), subscriptionYaml: '# provider timestamp\r\nproxies: [ ]\r\n' })
  assert.equal(calls.length, 1)
})

for (const reconnectManually of [false, true]) test(`default crash retry respects connection revision, manual reconnect=${reconnectManually}`, async t => {
  const { EventEmitter } = require('node:events'); const events = new EventEmitter()
  let restarts = 0; let state = 'idle'
  const engine = { initialize: async () => {}, getState: () => state,
    on: (name, fn) => { events.on(name, fn); return () => events.off(name, fn) },
    start: async () => { state = 'running' }, stop: async () => { state = 'idle' },
    restart: async () => { restarts++; state = 'running' } }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = new RuntimeManager(() => engine)
  await manager.initialize('mihomo', {}); await manager.connect(profile())
  state = 'crashed'; events.emit('stopped', { reason: 'crashed' })
  if (reconnectManually) { await manager.disconnect(); await manager.connect(profile('New')) }
  t.mock.timers.tick(1000)
  for (let i = 0; i < 20; i++) await Promise.resolve()
  assert.equal(restarts, reconnectManually ? 0 : 1)
  await manager.disconnect()
})
