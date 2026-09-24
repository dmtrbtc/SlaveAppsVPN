const { test } = require('node:test')
const assert = require('node:assert/strict')
const { HealthMonitor } = require('../dist/mihomo/HealthMonitor')

function fixture() {
  const emitted = []
  const monitor = new HealthMonitor(() => true, { isAlive: async () => true }, {
    emit: (name, payload) => emitted.push([name, payload]),
  }, 30_000)
  monitor.configure({ mixedPort: 7890 })
  monitor.checkTun = async () => true
  return { monitor, emitted }
}

test('successful hostname connectivity proves runtime DNS despite c-ares failure', async () => {
  const { monitor, emitted } = fixture()
  monitor.checkConnectivity = async () => true
  let dnsChecks = 0
  monitor.checkDns = async () => { dnsChecks++; return false }
  await monitor.runChecks()
  assert.equal(monitor.getHealth().connectivityOk, true)
  assert.equal(monitor.getHealth().dnsOk, true)
  assert.equal(emitted.at(-1)[1].health.dnsOk, true)
  assert.equal(dnsChecks, 0)
})

test('DNS remains failed when neither end-to-end nor resolver probe succeeds', async () => {
  const { monitor } = fixture()
  monitor.checkConnectivity = async () => false
  monitor.checkDns = async () => false
  await monitor.runChecks()
  assert.equal(monitor.getHealth().dnsOk, false)
})

test('startup connectivity failure is retried promptly instead of waiting for the normal interval', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const { monitor } = fixture()
  let attempts = 0
  monitor.checkConnectivity = async () => ++attempts > 1
  monitor.checkDns = async () => false
  monitor.start()
  await new Promise(setImmediate)
  assert.equal(attempts, 1)
  assert.equal(monitor.getHealth().connectivityOk, false)
  t.mock.timers.tick(1_000)
  await new Promise(setImmediate)
  assert.equal(attempts, 2)
  assert.equal(monitor.getHealth().connectivityOk, true)
  monitor.stop()
})

test('late startup health result is discarded after stop', async () => {
  const { monitor } = fixture()
  let release
  let entered
  const started = new Promise(resolve => { entered = resolve })
  monitor.checkConnectivity = () => new Promise(resolve => { release = resolve; entered() })
  monitor.checkDns = async () => false
  monitor.start()
  await started
  monitor.stop()
  release(true)
  await new Promise(setImmediate)
  assert.equal(monitor.getHealth().checkedAt, 0)
})

test('connectivity check accepts an independent fallback endpoint', async t => {
  const http = require('node:http')
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push(req.url)
    res.writeHead(req.url.includes('cp.cloudflare.com') ? 204 : 503)
    res.end()
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const { monitor } = fixture()
  monitor.configure({ mixedPort: server.address().port })
  monitor.checkDns = async () => false
  await monitor.runChecks()
  assert.equal(monitor.getHealth().connectivityOk, true)
  assert.equal(monitor.getHealth().dnsOk, true)
  assert.equal(requests.length, 2)
})
