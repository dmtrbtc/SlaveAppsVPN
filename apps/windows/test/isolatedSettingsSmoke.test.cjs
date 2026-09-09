const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/main/isolatedSettingsSmoke.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function fixture({ enabled = true, packaged = false, directory = path.join('C:', 'temp', 'slave-settings-ui-test'), marker = true } = {}) {
  const calls = []
  const app = { isPackaged: packaged, setName: (...v) => calls.push(['name', ...v]), setAppUserModelId: (...v) => calls.push(['id', ...v]), setPath: (...v) => calls.push(['path', ...v]) }
  const processStub = { argv: enabled ? ['--isolated-settings-smoke'] : [], env: { SLAVE_SETTINGS_SMOKE_DIR: directory, ELECTRON_RENDERER_URL: 'synthetic' } }
  const mocks = { electron: { app }, fs: { existsSync: p => p.endsWith('.settings-smoke') ? marker : true, realpathSync: p => path.resolve(p) }, path, os: { tmpdir: () => path.join('C:', 'temp') } }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', 'process', code)(id => mocks[id], mod, mod.exports, processStub)
  return { run: mod.exports.initializeSettingsSmoke, calls, processStub }
}
test('normal startup performs no smoke path or identity mutations', () => {
  const f = fixture({ enabled: false }); f.run(); assert.deepEqual(f.calls, [])
})
test('packaged builds and unmarked/outside directories fail before mutation', () => {
  for (const options of [{ packaged: true }, { marker: false }, { directory: path.join('C:', 'real-profile') }]) {
    const f = fixture(options); assert.throws(f.run); assert.deepEqual(f.calls, [])
  }
})
test('valid smoke isolates all writable Electron paths and removes dev-server URL', () => {
  const f = fixture(); f.run()
  assert.deepEqual(f.calls.filter(c => c[0] === 'path').map(c => c[1]), ['userData', 'sessionData', 'crashDumps'])
  assert.equal(f.processStub.env.ELECTRON_RENDERER_URL, undefined)
})
