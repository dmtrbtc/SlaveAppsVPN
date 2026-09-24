// Isolated real Electron settings lifecycle; never loads the application entrypoint.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const appRequire = createRequire(path.join(root, 'apps/windows/package.json'))

async function child() {
  const { app } = require('electron')
  const directory = path.resolve(process.env.SLAVE_SETTINGS_SMOKE_DIR)
  assert.ok(directory.startsWith(path.resolve(os.tmpdir()) + path.sep))
  assert.ok(path.basename(directory).startsWith('slave-settings-electron-'))
  app.setName('SlaveSettingsIsolatedSmoke')
  app.setPath('userData', directory)
  app.setPath('sessionData', directory)
  app.setPath('crashDumps', path.join(directory, 'crashes'))
  app.disableHardwareAcceleration()
  await app.whenReady()
  const ts = appRequire('typescript')
  const modules = new Map()
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports
    const mod = { exports: {} }
    modules.set(filename, mod)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    new Function('require', 'module', 'exports', code)(id => {
      if (id === './JsonFileStorageAdapter') return load(path.join(path.dirname(filename), id + '.ts'))
      return appRequire(id)
    }, mod, mod.exports)
    return mod.exports
  }
  const singleton = load(path.join(root, 'apps/windows/src/main/services/SettingsStore.ts'))
  assert.throws(() => singleton.getSettingsStore(), /not initialized/)
  const [store, same] = await Promise.all([singleton.initSettingsStore(), singleton.initSettingsStore()])
  assert.equal(store, same)
  assert.equal(singleton.getSettingsStore(), store)
  if (process.env.SLAVE_SETTINGS_SMOKE_PHASE === 'write') {
    assert.equal(store.get('language'), 'en')
    assert.equal(store.get('vpnMode'), 'blocked')
    await Promise.all([
      store.patch({ language: 'ru', splitProcessList: ['synthetic-first.exe'] }),
      store.patch({ vpnMode: 'full', splitProcessList: ['synthetic-last.exe'] }),
    ])
  } else {
    assert.equal(store.get('language'), 'ru')
    assert.equal(store.get('vpnMode'), 'full')
    assert.deepEqual(store.get('splitProcessList'), ['synthetic-last.exe'])
  }
  process.stdout.write('SMOKE_OK ' + JSON.stringify({ phase: process.env.SLAVE_SETTINGS_SMOKE_PHASE, electron: process.versions.electron }) + '\n')
  app.exit(0)
}

async function parent() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slave-settings-electron-'))
  try {
    fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ language: 'en', autoStart: false, autoConnect: false }))
    const phases = []
    for (const phase of ['write', 'read']) {
      const env = { ...process.env, SLAVE_SETTINGS_SMOKE_DIR: directory, SLAVE_SETTINGS_SMOKE_PHASE: phase }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.VITE_API_URL
      delete env.VITE_TELEGRAM_BOT_USERNAME
      const result = await new Promise((resolve, reject) => {
        const proc = spawn(appRequire('electron'), [__filename, '--settings-smoke-child'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        const timer = setTimeout(() => { proc.kill(); reject(new Error('Electron smoke timed out; exit not confirmed')) }, 30000)
        proc.stdout.on('data', chunk => { output += chunk })
        proc.stderr.resume()
        proc.on('error', error => { clearTimeout(timer); reject(error) })
        proc.on('exit', code => {
          clearTimeout(timer)
          if (code !== 0) return reject(new Error('Electron smoke failed with exit code ' + code))
          const match = output.match(/SMOKE_OK (.+)/)
          if (!match) return reject(new Error('Electron smoke success marker missing'))
          resolve(JSON.parse(match[1]))
        })
      })
      phases.push(result)
    }
    const disk = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'))
    assert.equal(disk['slave.settings.v1'], undefined)
    assert.equal(disk.vpnMode, 'full')
    const result = { checkedAt: new Date().toISOString(), phases, processExitConfirmed: true, legacyFlatLoad: true, concurrentInitialization: true, orderedWrites: true, restartPersistence: true, realClientUI: false, vpnTested: false }
    fs.writeFileSync(path.join(root, 'docs/WINDOWS_SETTINGS_ELECTRON_SMOKE.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result))
  } finally {
    const resolved = path.resolve(directory)
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('slave-settings-electron-')) fs.rmSync(resolved, { recursive: true, force: true })
  }
}

(process.argv.includes('--settings-smoke-child') ? child() : parent()).catch(() => {
  console.error('Isolated settings smoke failed; no settings contents emitted')
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})
