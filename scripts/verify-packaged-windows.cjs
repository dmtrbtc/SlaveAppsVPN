// Run with matching Electron and ELECTRON_RUN_AS_NODE=1; never loads app main.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const resources = path.join(root, 'apps/windows/release/0.2.41-dev.11/win-unpacked/resources')
const archive = path.join(resources, 'app.asar')
const appRequire = createRequire(path.join(archive, 'package.json'))
const pkg = appRequire('./package.json')
assert.equal(pkg.version, '0.2.41-dev.11')
assert.equal(process.versions.electron, '39.8.10')
for (const name of Object.keys(pkg.dependencies)) {
  const resolved = appRequire.resolve(name)
  assert.ok(resolved.startsWith(archive + path.sep), `Dependency escaped package: ${name}`)
}
const { RuntimeManager } = appRequire('@slave-vpn/runtime')
assert.equal(typeof RuntimeManager.prototype.isConnectionDesired, 'function')
const runtimeFile = appRequire.resolve('@slave-vpn/runtime')
const runtimeRequire = createRequire(runtimeFile)
for (const relative of ['RuntimeManager.js', 'mihomo/MihomoEngine.js', 'mihomo/ProcessManager.js', 'mihomo/ProcessWatcher.js']) {
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(runtimeFile), relative)), fs.readFileSync(path.join(root, 'packages/runtime/dist', relative)))
}
const { MihomoEngine } = runtimeRequire('./mihomo/MihomoEngine')
assert.equal(typeof MihomoEngine.prototype.recoverProfile, 'function')
const sqlRequire = createRequire(appRequire.resolve('@slave-vpn/state-sync'))
const Database = sqlRequire('better-sqlite3')
const db = new Database(':memory:')
assert.equal(db.prepare('select 1 as ok').get().ok, 1); db.close()
for (const name of ['mihomo.exe', 'sing-box.exe', 'wintun.dll']) assert.ok(fs.statSync(path.join(resources, 'bin', name)).size > 0)
const main = fs.readFileSync(path.join(archive, 'out/main/index.js'), 'utf8')
assert.ok(main.includes('autoReconnect: false'))
assert.equal(main, fs.readFileSync(path.join(root, 'apps/windows/out/main/index.js'), 'utf8'))
const result = { version: pkg.version, electron: process.versions.electron, dependenciesResolved: Object.keys(pkg.dependencies).length,
  lifecycleIncluded: true, compiledFilesMatch: true, nativeSqlite: 'passed', resources: 'passed' }
fs.writeFileSync(path.join(root, 'docs/WINDOWS_LIFECYCLE_PACKAGE_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
