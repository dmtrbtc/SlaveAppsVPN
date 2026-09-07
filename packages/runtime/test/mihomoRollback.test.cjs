const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { MihomoEngine } = require('../dist/mihomo/MihomoEngine')

const profile = () => ({ subscriptionYaml: 'proxies: []', selectedProxy: 'Manual', vpnMode: 'blocked',
  generatorSettings: { tunEnabled: true, tunStack: 'mixed', mixedPort: 7890,
    fallbackDns: [], dnsOverHttps: 'https://example.test/dns-query', fakeIpEnabled: true } })

async function integratedFixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mihomo-integrated-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const engine = new MihomoEngine()
  await engine.initialize({ workingDir: dir, apiPort: 19090, apiSecret: 'synthetic', binaryPath: 'synthetic' })
  let alive = false; let exit; let spawns = 0; let failSelection = false; let failKill = false
  engine.processManager.spawn = async cb => { assert.equal(alive, false); alive = true; exit = cb; spawns++ }
  engine.processManager.getPid = () => alive ? 123 : null
  engine.processManager.kill = async reason => {
    if (failKill) throw new Error('termination unconfirmed')
    if (alive) { alive = false; exit(reason, 0) }
  }
  engine.api = { isAlive: async () => alive, getVersion: async () => ({ version: 'synthetic' }),
    selectProxy: async () => { if (failSelection) { failSelection = false; throw new Error('selection failed') } } }
  engine.healthMonitor = { configure() {}, start() {}, stop() {} }
  engine.trafficMonitor = { start() {}, stop() {} }
  return { engine, dir, spawns: () => spawns,
    crash: () => { alive = false; exit('crashed', 1) },
    failSelection: () => { failSelection = true }, failKill: () => { failKill = true } }
}
test('RuntimeManager reconnects real Mihomo start path from crashed state', async t => {
  const f = await integratedFixture(t)
  const { RuntimeManager } = require('../dist/RuntimeManager')
  // The engine was initialized by the fixture; only this setup step is replaced.
  f.engine.initialize = async () => {}
  const manager = new RuntimeManager(() => f.engine, { autoReconnect: false })
  await manager.initialize('mihomo', {})
  await manager.connect(profile()); f.crash()
  assert.equal(manager.getState(), 'crashed')
  await manager.connect(profile())
  assert.equal(manager.getState(), 'running'); assert.equal(f.spawns(), 2)
  await manager.disconnect(); assert.equal(manager.getState(), 'idle')
})
test('initial selection failure leaves real start path in error without running event', async t => {
  const f = await integratedFixture(t); const states = []
  f.engine.on('stateChanged', ({ state }) => states.push(state))
  f.failSelection(); await assert.rejects(f.engine.start(profile()), /selection failed/)
  assert.equal(f.engine.getState(), 'error'); assert.ok(!states.includes('running'))
  assert.equal(f.engine.processManager.getPid(), null)
})
test('process exit after forced kill resolves and removes termination listener', async t => {
  const { ProcessManager } = require('../dist/mihomo/ProcessManager')
  const { EngineEventBus } = require('../dist/engine/EngineEvents')
  const { EventEmitter } = require('node:events')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = new ProcessManager(new EngineEventBus()); const proc = new EventEmitter()
  proc.kill = () => true; manager.process = proc
  const pending = manager.kill(); t.mock.timers.tick(5000)
  proc.emit('exit', 0); await pending
  assert.equal(manager.getPid(), null); assert.equal(proc.listenerCount('exit'), 0)
  t.mock.timers.tick(5000)
})
test('post-spawn process error does not masquerade as confirmed exit', () => {
  const { ProcessWatcher } = require('../dist/mihomo/ProcessWatcher')
  const { EventEmitter } = require('node:events')
  const watcher = new ProcessWatcher(); const proc = new EventEmitter(); const exits = []
  proc.pid = 123
  watcher.attach(proc, (...args) => exits.push(args))
  proc.emit('error', new Error('synthetic kill failure'))
  assert.equal(exits.length, 0)
  proc.emit('exit', 1, null); assert.equal(exits.length, 1)
})
test('real start and restart restore previous profile after initial candidate selection fails', async t => {
  const f = await integratedFixture(t)
  await f.engine.start(profile()); f.failSelection()
  const next = { ...profile(), generatorSettings: { ...profile().generatorSettings, mixedPort: 7891 } }
  await assert.rejects(f.engine.updateProfile(next), /selection failed/)
  assert.equal(f.engine.getState(), 'running')
  assert.deepEqual(f.engine.currentProfile, profile())
  assert.equal(f.spawns(), 3)
  assert.match(await fs.readFile(path.join(f.dir, 'config.yaml'), 'utf8'), /mixed-port: 7890/)
})
test('unconfirmed termination blocks later start before config mutation', async t => {
  const f = await integratedFixture(t)
  await f.engine.start(profile()); f.failKill()
  const next = { ...profile(), generatorSettings: { ...profile().generatorSettings, mixedPort: 7891 } }
  await assert.rejects(f.engine.updateProfile(next))
  const before = await fs.readFile(path.join(f.dir, 'config.yaml'), 'utf8')
  await assert.rejects(f.engine.start(next))
  assert.equal(await fs.readFile(path.join(f.dir, 'config.yaml'), 'utf8'), before)
  assert.equal(f.spawns(), 1)
  assert.equal(f.engine.getState(), 'error')
})
test('process kill waits for exit after escalation and rejects missing exit', async t => {
  const { ProcessManager } = require('../dist/mihomo/ProcessManager')
  const { EngineEventBus } = require('../dist/engine/EngineEvents')
  const { EventEmitter } = require('node:events')
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = new ProcessManager(new EngineEventBus())
  const proc = new EventEmitter(); const signals = []
  proc.kill = signal => { signals.push(signal); return true }
  manager.process = proc
  let settled = false
  const pending = manager.kill().finally(() => { settled = true })
  const rejected = assert.rejects(pending, /exit|termination/i)
  t.mock.timers.tick(5000); await Promise.resolve(); await Promise.resolve()
  assert.equal(settled, false)
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  t.mock.timers.tick(5000); await rejected
  assert.equal(manager.process, proc)
})

async function fixture(t, failures = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mihomo-rollback-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const config = path.join(dir, 'config.yaml')
  await fs.writeFile(config, 'last-good')
  const engine = new MihomoEngine()
  const calls = []; const counts = {}
  const step = async name => {
    calls.push(name)
    const count = counts[name] = (counts[name] || 0) + 1
    if (failures.includes(`${name}:${count}`)) throw new Error(`failed ${name}`)
  }
  engine.initConfig = { workingDir: dir }
  engine.currentProfile = profile()
  engine.fsm.transition('starting'); engine.fsm.transition('running')
  engine.api = {
    reloadConfig: () => step('put'), closeAllConnections: () => step('close'),
    selectProxy: async (_, name) => { await step('select'); calls.push(name) },
  }
  engine.processManager.kill = async () => step('kill')
  engine.writeConfig = async () => {
    await fs.writeFile(config, 'candidate')
    await step('write')
  }
  const completed = []
  engine.on('reloadCompleted', event => completed.push(event))
  return { engine, calls, completed, config, next: { ...profile(), vpnMode: 'full' } }
}

for (const failure of ['write:1', 'put:1', 'close:1', 'select:1']) {
  test(`${failure} restores disk, applied config and manual target`, async t => {
    const f = await fixture(t, [failure])
    await assert.rejects(f.engine.updateProfile(f.next), /failed/)
    assert.equal(await fs.readFile(f.config, 'utf8'), 'last-good')
    assert.equal(f.engine.getState(), 'running')
    assert.deepEqual(f.engine.currentProfile, profile())
    assert.deepEqual(f.calls.slice(-3), ['put', 'select', 'Manual'])
    assert.equal(f.completed.length, 0)
    assert.equal(await f.engine.updateProfile(f.next), 'reconnect')
  })
}
for (const failure of ['put:2', 'select:1']) {
  test(`rollback ${failure} stops engine and reports error`, async t => {
    const f = await fixture(t, ['put:1', failure])
    await assert.rejects(f.engine.updateProfile(f.next), /rollback failed/)
    assert.equal(f.engine.getState(), 'error')
    assert.ok(f.calls.includes('kill'))
    assert.equal(f.completed.length, 0)
    await assert.rejects(f.engine.updateProfile(f.next), /state: error/)
  })
}
test('unreadable recovery artifact prevents any mutation', async t => {
  const f = await fixture(t)
  await fs.unlink(f.config)
  await assert.rejects(f.engine.updateProfile(f.next))
  assert.deepEqual(f.calls, [])
  assert.equal(f.engine.getState(), 'running')
})
test('ambiguous hot selection failure restores previous selection', async t => {
  const f = await fixture(t, ['select:1'])
  await assert.rejects(f.engine.updateProfile({ ...profile(), selectedProxy: 'Other' }))
  assert.deepEqual(f.calls, ['select', 'select', 'Manual'])
  assert.equal(f.engine.getState(), 'running')
})
for (const recoveryFails of [false, true]) {
  test(`full restart failure, recovery fails=${recoveryFails}`, async t => {
    const f = await fixture(t)
    f.engine.restart = async () => { throw new Error('start failed') }
    f.engine.start = async p => {
      f.engine.fsm.transition('starting')
      if (recoveryFails) { f.engine.fsm.transition('error'); throw new Error('recovery start failed') }
      f.engine.fsm.transition('running')
      f.engine.currentProfile = p
    }
    const next = { ...profile(), generatorSettings: { ...profile().generatorSettings, mixedPort: 7891 } }
    await assert.rejects(f.engine.updateProfile(next))
    assert.equal(f.engine.getState(), recoveryFails ? 'error' : 'running')
    assert.deepEqual(f.engine.currentProfile, profile())
    assert.equal(f.completed.length, 0)
  })
}

test('rollback disk write failure reports error and stops the engine', async t => {
  const f = await fixture(t, ['put:1'])
  const write = fs.writeFile
  t.mock.method(fs, 'writeFile', async (file, data, ...args) => {
    if (file === f.config && data === 'last-good') throw new Error('disk unavailable')
    return write(file, data, ...args)
  })
  await assert.rejects(f.engine.updateProfile(f.next), /rollback failed/)
  assert.equal(f.engine.getState(), 'error')
  assert.equal(f.completed.length, 0)
})
