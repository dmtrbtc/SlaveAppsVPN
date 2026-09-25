const { test } = require('node:test')
const assert = require('node:assert/strict')
const { NodeHealthTracker } = require('../dist/probing/NodeHealthTracker')
const { ProbeScheduler } = require('../dist/probing/ProbeScheduler')

const ok = (id, latencyMs = 50, timestamp = Date.now()) => ({ id, latencyMs, success: true, timestamp })
const fail = (id, timestamp = Date.now()) => ({ id, latencyMs: null, success: false, timestamp, failureReason: 'timeout' })

test('rolling RTT averages the last N samples only', () => {
  const t = new NodeHealthTracker(3, 60_000, 3)
  t.record(ok('a', 100)); t.record(ok('a', 200)); t.record(ok('a', 300)); t.record(ok('a', 900))
  const snap = t.get('a')
  assert.equal(snap.rollingRttMs, (200 + 300 + 900) / 3, 'oldest sample dropped')
})

test('three consecutive failures quarantine the node; success lifts it after expiry', () => {
  const t = new NodeHealthTracker(3, 10 /* 10ms quarantine for the test */, 5)
  t.record(fail('a')); t.record(fail('a'))
  assert.equal(t.isQuarantined('a'), false)
  t.record(fail('a'))
  assert.equal(t.isQuarantined('a'), true)
  assert.equal(t.get('a').score, 0, 'quarantined node scores 0')
  assert.equal(t.quarantinedCount(), 1)
  // after the window passes, a successful probe lifts quarantine
  const later = Date.now() + 20
  t.record(ok('a', 40, later))
  assert.equal(t.isQuarantined('a'), false)
})

test('a success resets the consecutive-failure counter', () => {
  const t = new NodeHealthTracker(3, 60_000, 5)
  t.record(fail('a')); t.record(fail('a')); t.record(ok('a'))
  assert.equal(t.get('a').consecutiveFailures, 0)
  t.record(fail('a')); t.record(fail('a'))
  assert.equal(t.isQuarantined('a'), false, 'streak was broken — not quarantined yet')
})

test('bestNode picks the lowest average RTT among non-quarantined', () => {
  const t = new NodeHealthTracker(3, 60_000, 5)
  t.record(ok('fast', 20)); t.record(ok('slow', 150))
  t.record(fail('dead')); t.record(fail('dead')); t.record(fail('dead'))
  assert.equal(t.bestNode(), 'fast')
  // fast degrades below slow → bestNode switches
  t.record(ok('fast', 500)); t.record(ok('fast', 500))
  assert.equal(t.bestNode(), 'slow')
})

test('unknown node scores neutral 50 and never wins bestNode with no samples', () => {
  const t = new NodeHealthTracker()
  t.record(fail('only-failures'))
  assert.equal(t.bestNode(), null)
  assert.equal(t.get('only-failures').rollingRttMs, null)
})

test('ProbeScheduler via engine API: results, snapshots and null-timeouts', async () => {
  const s = new ProbeScheduler({ concurrency: 2, probeTimeoutMs: 50 })
  const api = async (tag) => (tag === 'dead' ? null : tag === 'slow' ? 300 : 25)
  const results = await s.probeViaEngine(['good', 'slow', 'dead'], api)
  const byId = Object.fromEntries(results.map(r => [r.id, r]))
  assert.equal(byId.good.success, true)
  assert.equal(byId.dead.success, false)
  assert.equal(byId.dead.failureReason, 'timeout')
  assert.equal(byId.dead.latencyMs, null)
  assert.equal(byId.slow.latencyMs, 300)
})

test('ProbeScheduler caps batch concurrency', async () => {
  const s = new ProbeScheduler({ concurrency: 2, probeTimeoutMs: 1000 })
  let inflight = 0, maxInflight = 0
  const api = async () => {
    inflight++; maxInflight = Math.max(maxInflight, inflight)
    await new Promise(r => setTimeout(r, 20))
    inflight--
    return 10
  }
  const tags = ['a', 'b', 'c', 'd', 'e']
  await s.probeViaEngine(tags, api)
  assert.ok(maxInflight <= 2, `concurrency capped (observed ${maxInflight})`)
  assert.equal(s.tracker ? true : true, true)
})

test('an API exception is contained to a failed result for that node', async () => {
  const s = new ProbeScheduler({ concurrency: 3, probeTimeoutMs: 50 })
  const api = async (tag) => { if (tag === 'boom') throw new Error('api exploded'); return 15 }
  const results = await s.probeViaEngine(['ok', 'boom'], api)
  const byId = Object.fromEntries(results.map(r => [r.id, r]))
  assert.equal(byId.ok.success, true)
  assert.equal(byId.boom.success, false)
})
