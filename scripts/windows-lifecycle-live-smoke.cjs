// Isolated process/API smoke, not a TUN or Electron end-to-end test.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const net = require('node:net')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const runtimeRequire = createRequire(path.join(root, 'packages/runtime/package.json'))
const yaml = runtimeRequire('js-yaml')
const { MihomoEngine } = runtimeRequire('./dist/mihomo/MihomoEngine')
const { getSelectGroupName } = runtimeRequire('@slave-vpn/config')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function port() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const result = server.address().port
  await new Promise(resolve => server.close(resolve))
  return result
}
async function main() {
  const dir = await fs.mkdtemp(path.join(root, '.live-smoke-'))
  const apiPort = await port(); const mixedPort = await port(); const nextPort = await port()
  const engine = new MihomoEngine(); const evidence = []
  const record = (step, details = {}) => evidence.push({ time: new Date().toISOString(), step, ...details })
  const apiSecret = require('node:crypto').randomBytes(24).toString('hex')
  await engine.initialize({ binaryPath: path.join(root, 'apps/windows/resources/bin/mihomo.exe'), workingDir: dir, apiPort, apiSecret,
    rulesDir: path.join(root, 'apps/windows/resources/rules') })
  // Keep production generation/writes, but constrain this test's generated file:
  // no DNS listener, TUN, remote health checks or external provider downloads.
  const writeConfig = engine.writeConfig.bind(engine)
  engine.writeConfig = async profile => {
    await writeConfig(profile)
    const filename = path.join(dir, 'config.yaml')
    const config = yaml.load(await fs.readFile(filename, 'utf8'))
    assert.ok(!config.tun); assert.ok(!config['rule-providers'])
    config.dns = { enable: false }; config['bind-address'] = '127.0.0.1'
    for (const group of config['proxy-groups']) if (group.url) group.url = 'http://127.0.0.1:1/health'
    await fs.writeFile(filename, yaml.dump(config))
  }
  // Only external connectivity/DNS probes are replaced; process and API are real.
  engine.healthMonitor.checkConnectivity = async () => false
  engine.healthMonitor.checkDns = async () => false
  engine.on('stateChanged', event => record('state', { state: event.state }))
  engine.on('logLine', event => { if (event.level === 'error') record('engine-error', { level: event.level }) })
  const profile = { subscriptionYaml: 'proxies:\n  - name: Manual\n    type: socks5\n    server: 127.0.0.1\n    port: 1\n', selectedProxy: 'Manual', vpnMode: 'full',
    generatorSettings: { tunEnabled: false, tunStack: 'mixed', mixedPort, fallbackDns: [], dnsOverHttps: 'https://127.0.0.1/dns-query', fakeIpEnabled: false } }
  async function selected(expected) {
    const response = await fetch(`http://127.0.0.1:${apiPort}/proxies/${encodeURIComponent(getSelectGroupName())}`, { headers: { Authorization: `Bearer ${apiSecret}` }, signal: AbortSignal.timeout(3000) })
    assert.equal(response.status, 200); assert.equal((await response.json()).now, expected)
  }
  try {
    await engine.start(profile); assert.equal(engine.getState(), 'running'); await selected('Manual')
    const pid = engine.processManager.getPid(); record('clean-start', { version: engine.engineVersion })
    await delay(300)
    assert.equal(await engine.updateProfile(structuredClone(profile)), 'none')
    assert.equal(engine.processManager.getPid(), pid); record('delayed-identical-refresh-none')
    const auto = { ...profile, selectedProxy: 'SLAVE-AUTO' }
    assert.equal(await engine.updateProfile(auto), 'hot'); await selected('SLAVE-AUTO')
    assert.equal(await engine.updateProfile(profile), 'hot'); await selected('Manual'); record('manual-auto-manual-hot')
    const blocked = { ...profile, vpnMode: 'blocked' }
    assert.equal(await engine.updateProfile(blocked), 'reconnect'); await selected('Manual')
    assert.equal(engine.processManager.getPid(), pid); record('mode-reload-preserves-process-selection')
    const before = await fs.readFile(path.join(dir, 'config.yaml'), 'utf8')
    await assert.rejects(engine.updateProfile({ ...profile, selectedProxy: 'missing-synthetic-node' }))
    assert.equal(engine.getState(), 'running'); await selected('Manual')
    assert.equal(await fs.readFile(path.join(dir, 'config.yaml'), 'utf8'), before)
    record('real-http-selection-failure-restores-config-selection')
    const restarted = { ...blocked, generatorSettings: { ...blocked.generatorSettings, mixedPort: nextPort } }
    assert.equal(await engine.updateProfile(restarted), 'full_restart'); await selected('Manual')
    assert.notEqual(engine.processManager.getPid(), pid); record('full-restart-confirmed')
    process.kill(engine.processManager.getPid(), 'SIGKILL')
    for (let n = 0; n < 60 && engine.getState() !== 'crashed'; n++) await delay(50)
    assert.equal(engine.getState(), 'crashed')
    await engine.restart('crashed'); await selected('Manual'); record('real-process-crash-restart')
    await engine.stop(); assert.equal(engine.getState(), 'idle'); assert.equal(engine.processManager.getPid(), null)
    record('stop-confirms-exit'); record('result', { passed: true })
  } catch (error) {
    record('result', { passed: false, error: error.message }); throw error
  } finally {
    await engine.stop().catch(() => {}); await engine.dispose()
    await fs.writeFile(path.join(root, 'docs/WINDOWS_LIFECYCLE_LIVE_SMOKE.json'), JSON.stringify(evidence, null, 2) + '\n')
    // Only the exact mkdtemp directory under this worktree is removed.
    assert.equal(path.dirname(dir), root); assert.ok(path.basename(dir).startsWith('.live-smoke-'))
    await fs.rm(dir, { recursive: true, force: true })
  }
  console.log('Isolated real Mihomo process/API smoke: PASS')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
