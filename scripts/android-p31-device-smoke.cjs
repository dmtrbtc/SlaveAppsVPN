// Only targets the fresh, isolated P3.1 smoke package. Never reads other apps.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const adbPath = 'E:\\dev\\Android\\platform-tools\\adb.exe'
const packageName = 'com.slavevpn.app.p31smoke'
const adb = (...args) => execFileSync(adbPath, ['-d', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket, forward
async function close() {
  if (socket) { socket.close(); socket = null }
  if (forward) { adb('forward', '--remove', `tcp:${forward}`); forward = null }
}
async function open() {
  adb('shell', 'am', 'start', '-n', `${packageName}/com.slavevpn.app.MainActivity`)
  let pid
  for (let i = 0; i < 30; i++) {
    try { pid = adb('shell', 'pidof', packageName); if (/^\d+$/.test(pid)) break } catch {}
    await pause(200)
  }
  assert.match(pid || '', /^\d+$/)
  forward = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`)
  let target
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${forward}/json`)).json()
      target = targets.find(t => t.type === 'page' && t.url.startsWith('https://localhost'))
      if (target) break
    } catch {}
    await pause(250)
  }
  assert.ok(target, 'Isolated app WebView not ready')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  return pid
}
let sequence = 0
function evaluate(expression) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Evaluation timeout')) }, 15000)
    function listener(event) {
      const result = JSON.parse(event.data)
      if (result.id !== id) return
      clearTimeout(timer)
      socket.removeEventListener('message', listener)
      if (result.error || result.result?.exceptionDetails) return reject(new Error('Isolated evaluation failed'))
      resolve(result.result.result.value)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  })
}
async function ready() {
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!window.slaveVPN?.settings && typeof structuredClone === "function"')) return
    await pause(200)
  }
  throw new Error('Settings bridge not ready')
}
const verify = `(async () => {
  const current = await window.slaveVPN.settings.get();
  const key = 'slave.settings.v1';
  const local = JSON.parse(localStorage.getItem(key) || 'null');
  let native;
  for (let i = 0; i < 30; i++) {
    native = JSON.parse((await window.Capacitor.nativePromise('Preferences', 'get', {key})).value || 'null');
    if (native?.language === 'en' && native?.dnsPreset === 'google') break;
    await new Promise(r => setTimeout(r, 100));
  }
  const valid = s => s?.language === 'en' && s?.dnsPreset === 'google' &&
    JSON.stringify(s?.enabledScenarios) === JSON.stringify(['ai-services']);
  return { bridge: current.ok && valid(current.data), local: valid(local), native: valid(native),
    mirrorMatches: JSON.stringify(local) === JSON.stringify(native) };
})()`
async function main() {
  assert.equal(adb('shell', 'pm', 'list', 'packages', packageName), 'package:' + packageName)
  await open()
  await ready()
  const writes = await evaluate(`(async () => {
    const result = await Promise.all([
      window.slaveVPN.settings.set({language:'ru',enabledScenarios:['roscomvpn-default']}),
      window.slaveVPN.settings.set({language:'en',dnsPreset:'google',enabledScenarios:['ai-services']})
    ]);
    return result.every(r => r.ok);
  })()`)
  assert.equal(writes, true)
  const before = await evaluate(verify)
  assert.ok(Object.values(before).every(Boolean))
  await close()
  adb('shell', 'am', 'force-stop', packageName)
  let stopped = false
  try { stopped = adb('shell', 'pidof', packageName) === '' } catch { stopped = true }
  assert.ok(stopped)
  const restartedPid = await open()
  await ready()
  const after = await evaluate(verify)
  assert.ok(Object.values(after).every(Boolean))
  const fatalLog = adb('logcat', '-d', `--pid=${restartedPid}`, '-s', 'AndroidRuntime:E')
  const result = { checkedAt: new Date().toISOString(), packageName, androidApi: adb('shell','getprop','ro.build.version.sdk'), concurrentWrites: true,
    beforeRestart: before, processStopConfirmed: stopped, afterRestart: after,
    restartedProcessFatalObserved: /FATAL EXCEPTION/.test(fatalLog), vpnConnectedByTest: false,
    productionPackageAccessed: false, existingDevPackageAccessed: false }
  assert.equal(result.restartedProcessFatalObserved, false)
  fs.writeFileSync(path.join(__dirname, '../docs/ANDROID_P31_DEVICE_SMOKE.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  await close()
  adb('shell', 'am', 'force-stop', packageName)
})
