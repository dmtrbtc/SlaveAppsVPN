// Compare the actual historical start implementation with synthetic platform seams.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const relative = 'packages/runtime/src/mihomo/MihomoEngine.ts'
const rows = []
async function compare(revision) {
  const source = revision === 'candidate' ? fs.readFileSync(path.join(root, relative), 'utf8')
    : execFileSync('git', ['show', `${revision}:${relative}`], { cwd: root, encoding: 'utf8' })
  const filename = path.join(root, 'packages/runtime/dist/mihomo/RegressionComparison.js')
  const mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  const engine = new mod.exports.MihomoEngine()
  await engine.initialize({ workingDir: 'synthetic', binaryPath: 'synthetic', apiPort: 1, apiSecret: '' })
  let alive = false; let exit; let spawns = 0; let stops = 0
  engine.writeConfig = async () => {}
  engine.processManager.spawn = async cb => { assert.equal(alive, false); alive = true; exit = cb; spawns++ }
  engine.processManager.getPid = () => alive ? 123 : null
  engine.processManager.kill = async reason => { if (alive) { alive = false; stops++; exit(reason, 0) } }
  engine.api = { isAlive: async () => alive, getVersion: async () => ({ version: 'synthetic' }),
    getProxyGroup: async () => ({ all: ['SLAVE-AUTO', 'available'] }),
    selectProxy: async (_, name) => { if (name === 'removed') throw new Error('Mihomo API error 400: proxy not exist') } }
  engine.healthMonitor = { configure() {}, start() {}, stop() {} }
  engine.trafficMonitor = { start() {}, stop() {} }
  const states = []; engine.on('stateChanged', ({ state }) => states.push(state))
  const profile = { subscriptionYaml: 'proxies: []', selectedProxy: 'removed', vpnMode: 'full', generatorSettings: {} }
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await engine.start(profile) } catch { /* record only state, never raw errors */ }
    if (engine.getState() === 'running') break
  }
  rows.push({ revision, state: engine.getState(), spawns, stops, states: [...states] })
  await engine.stop()
}
(async () => {
  for (const revision of ['v0.2.41-dev.10', '2ce419d', 'ada0aba', 'candidate']) await compare(revision)
  assert.deepEqual(rows.map(row => row.state), ['running', 'error', 'error', 'running'])
  assert.deepEqual(rows.map(row => row.spawns), [1, 3, 3, 1])
  fs.writeFileSync(path.join(root, 'docs/WINDOWS_REGRESSION_COMPARISON.json'), JSON.stringify(rows, null, 2) + '\n')
  console.log(JSON.stringify(rows))
})().catch(error => { console.error(error); process.exitCode = 1 })
