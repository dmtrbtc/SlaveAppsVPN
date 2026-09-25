const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function loadService(relative, mocks) {
  const filename = path.resolve(__dirname, '../src/main', relative)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = mod.require.bind(mod)
  mod.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    return nativeRequire(name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return mod.exports
}

const logger = { info() {}, warn() {}, error() {} }

function makeManager(userData) {
  const { SafeModeManager } = loadService('services/SafeModeManager.ts', {
    electron: { app: { getPath: () => userData } },
    '../logger': { getLogger: () => logger },
  })
  return new SafeModeManager()
}

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slave-safemode-'))
}

test('two rapid launches stay normal; the third crosses the crash-loop threshold', () => {
  const dir = freshDir()
  const sm1 = makeManager(dir); sm1.init(); assert.equal(sm1.isSafeMode(), false)
  const sm2 = makeManager(dir); sm2.init(); assert.equal(sm2.isSafeMode(), false)
  const sm3 = makeManager(dir); sm3.init()
  assert.equal(sm3.isSafeMode(), true, 'third rapid relaunch enters safe mode')
  assert.equal(sm3.getLaunchCount(), 3)
})

test('a healthy session resets the counter; later launches start fresh', () => {
  const dir = freshDir()
  const sm = makeManager(dir); sm.init(); sm.markHealthy()
  const sm2 = makeManager(dir); sm2.init()
  assert.equal(sm2.getLaunchCount(), 1)
  assert.equal(sm2.isSafeMode(), false)
})

test('markHealthy exits safe mode and clears the counter', () => {
  const dir = freshDir()
  for (let i = 0; i < 3; i++) { makeManager(dir).init() }
  const sm = makeManager(dir)
  assert.equal(sm.isSafeMode(), true)
  sm.markHealthy()
  assert.equal(sm.isSafeMode(), false)
  assert.equal(sm.getLaunchCount(), 0)
})

test('a slow relaunch (outside the window) counts as a fresh start', () => {
  const dir = freshDir()
  const sm = makeManager(dir); sm.init()
  // Simulate an old record: last launch two hours ago, unhealthy.
  const recordPath = path.join(dir, 'launch-record.json')
  const rec = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  rec.lastLaunch = Date.now() - 2 * 60 * 60 * 1000
  fs.writeFileSync(recordPath, JSON.stringify(rec))
  const sm2 = makeManager(dir); sm2.init()
  assert.equal(sm2.getLaunchCount(), 1)
  assert.equal(sm2.isSafeMode(), false)
})

test('safe mode survives process restarts (persisted flag)', () => {
  const dir = freshDir()
  for (let i = 0; i < 3; i++) { makeManager(dir).init() }
  const sm = makeManager(dir)
  assert.equal(sm.isSafeMode(), true)
  const smAfterRestart = makeManager(dir)
  assert.equal(smAfterRestart.isSafeMode(), true)
  smAfterRestart.resetSafeMode()
  assert.equal(smAfterRestart.isSafeMode(), false)
  assert.equal(makeManager(dir).isSafeMode(), false)
})

test('corrupt launch-record degrades to a clean start', () => {
  const dir = freshDir()
  fs.writeFileSync(path.join(dir, 'launch-record.json'), '{not json')
  const sm = makeManager(dir); sm.init()
  assert.equal(sm.isSafeMode(), false)
  assert.equal(sm.getLaunchCount(), 1)
})
