const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const appRequire = createRequire(path.join(root, 'apps/windows/package.json'))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function child() {
  const { app, BrowserWindow } = require('electron')
  const directory = process.env.SLAVE_SETTINGS_SMOKE_DIR
  let integrationCalls = 0
  for (const name of ['setLoginItemSettings', 'setAsDefaultProtocolClient']) {
    app[name] = () => { integrationCalls++; throw new Error('Unexpected OS integration') }
  }
  require(path.join(root, 'apps/windows/out/main/index.js'))
  let win
  for (let i = 0; i < 100; i++) {
    win = BrowserWindow.getAllWindows()[0]
    if (win && !win.webContents.isLoading()) break
    await pause(100)
  }
  assert.ok(win)
  const evaluate = expression => win.webContents.executeJavaScript(expression)
  for (let i = 0; i < 100; i++) {
    if (await evaluate('!!window.slaveVPN?.settings')) break
    await pause(100)
  }
  const first = await evaluate('window.slaveVPN.settings.get()')
  assert.equal(first.ok, true)
  assert.equal(first.data.minimizeToTray, process.env.SLAVE_UI_PHASE === 'write' ? false : true)
  // Follow the real onboarding control in this empty synthetic profile.
  for (let i = 0; i < 100; i++) {
    const skipped = await evaluate(`(() => {
      const skip = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Пропустить');
      if (skip) { skip.click(); return true; }
      return !!document.querySelector('a[href="#/settings"]');
    })()`)
    if (skipped) break
    await pause(100)
  }
  await pause(200)
  await evaluate("location.hash='/settings'")
  let settingsPage = false
  for (let i = 0; i < 100; i++) {
    try { settingsPage = await evaluate("location.hash === '#/settings' && document.querySelectorAll('[role=switch]').length > 0") } catch {}
    if (settingsPage) break
    await pause(100)
  }
  if (!settingsPage) console.log('UI_PAGE_DIAGNOSTIC ' + await evaluate('JSON.stringify({hash:location.hash,text:document.body.innerText.slice(0,2000)})'))
  assert.ok(settingsPage, 'Settings page did not render')
  const preferences = win.webContents.getLastWebPreferences()
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.sandbox, true)
  assert.equal(preferences.nodeIntegration, false)
  if (process.env.SLAVE_UI_PHASE === 'write') {
    const clicked = await evaluate(`(() => {
      const row = [...document.querySelectorAll('[role=switch]')].find(el => el.parentElement?.textContent.includes('Свернуть в трей'));
      if (!row) return false; row.click(); return true;
    })()`)
    assert.ok(clicked, 'Settings toggle missing')
    let saved = false
    for (let i = 0; i < 50; i++) {
      saved = (await evaluate('window.slaveVPN.settings.get()')).data.minimizeToTray === true
      if (saved) break
      await pause(100)
    }
    assert.ok(saved, 'UI change not persisted through IPC')
  }
  win.setTitle('P3.1 — isolated settings smoke')
  win.showInactive()
  await pause(1000)
  const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  win.hide()
  fs.writeFileSync(path.join(root, 'docs/WINDOWS_SETTINGS_UI_SMOKE.png'), image.toPNG())
  assert.equal(integrationCalls, 0)
  assert.equal(app.getPath('userData'), directory)
  const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'))
  assert.equal(persisted.minimizeToTray, true)
  console.log('UI_SMOKE_OK ' + JSON.stringify({ phase: process.env.SLAVE_UI_PHASE, settingsPage, realSettingsIPC: true, integrationsCalled: integrationCalls, sandbox: true }))
  app.quit()
}

async function parent() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slave-settings-ui-'))
  let safeToClean = true
  try {
    fs.writeFileSync(path.join(directory, '.settings-smoke'), '')
    fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ minimizeToTray: false, autoStart: false, autoConnect: false }))
    const phases = []
    for (const phase of ['write', 'read']) {
      const env = { ...process.env, SLAVE_SETTINGS_SMOKE_DIR: directory, SLAVE_UI_PHASE: phase }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.ELECTRON_RENDERER_URL
      delete env.VITE_API_URL
      delete env.VITE_TELEGRAM_BOT_USERNAME
      safeToClean = false
      const result = await new Promise((resolve, reject) => {
        const proc = spawn(appRequire('electron'), [__filename, '--ui-smoke-child', '--isolated-settings-smoke'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        const timer = setTimeout(() => { proc.kill(); reject(new Error('UI smoke timeout; process exit not yet confirmed')) }, 45000)
        proc.stdout.on('data', chunk => { output += chunk })
        proc.stderr.on('data', chunk => { output += chunk })
        proc.on('error', error => { clearTimeout(timer); reject(error) })
        proc.on('exit', code => {
          safeToClean = true
          clearTimeout(timer)
          const match = output.match(/UI_SMOKE_OK (.+)/)
          if (code !== 0 || !match) {
            const reason = output.match(/UI_SMOKE_FAILURE (.+)/)?.[1] || 'no success marker'
            fs.writeFileSync(path.join(root, 'docs/WINDOWS_SETTINGS_UI_SMOKE_DEBUG.log'), output)
            return reject(new Error('UI smoke failed: ' + reason + '; exit=' + code))
          }
          resolve(JSON.parse(match[1]))
        })
      })
      phases.push(result)
    }
    const result = { checkedAt: new Date().toISOString(), phases, processExitsConfirmed: true, vpnTested: false, safeModeBootstrap: true }
    fs.writeFileSync(path.join(root, 'docs/WINDOWS_SETTINGS_UI_SMOKE.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result))
  } finally {
    if (safeToClean && path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('slave-settings-ui-')) fs.rmSync(directory, { recursive: true, force: true })
  }
}
(process.argv.includes('--ui-smoke-child') ? child() : parent()).catch(error => {
  console.error('UI_SMOKE_FAILURE ' + error.message)
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})
