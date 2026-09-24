const { test } = require('node:test')
const assert = require('node:assert/strict')
const { NodeBalancer } = require('../dist/balancer/NodeBalancer')

// Scripted prober: per-node sequences of latencies (null = failed probe).
class ScriptedProber {
  constructor(script) {
    this.script = script // Record<node, (number|null)[]>
    this.round = 0
    this.calls = []
  }
  async probe(name, url, timeoutMs) {
    this.calls.push({ name, url, timeoutMs })
    const seq = this.script[name] ?? []
    return seq[this.round] ?? null
  }
  advance() { this.round++ }
}

function makeBalancer(script) {
  const prober = new ScriptedProber(script)
  const balancer = new NodeBalancer(prober, null)
  const selected = []
  balancer.onSelect(name => selected.push(name))
  return { prober, balancer, selected }
}

test('disabled balancer never starts probing or selects', async () => {
  const { balancer, selected } = makeBalancer({ a: [10] })
  balancer.start(['a'])
  balancer.stop()
  assert.equal(selected.length, 0)
})

test('empty proxy list is a no-op', async () => {
  const { balancer } = makeBalancer({})
  balancer.configure({ enabled: true })
  balancer.start([])
  // No timer was created and nothing threw.
  assert.equal(balancer.getState().nodes.length, 0)
})

test('latency mode picks the lowest-latency node and reports scores', async () => {
  const { prober, balancer, selected } = makeBalancer({ fast: [20], slow: [90] })
  balancer.configure({ enabled: true, mode: 'latency' })
  balancer.start(['fast', 'slow'])
  try {
    await balancer.probeAll(['fast', 'slow'])
    prober.advance()

    assert.deepEqual(selected, ['fast'])
    const state = balancer.getState()
    assert.equal(state.currentBest, 'fast')
    assert.equal(state.mode, 'latency')
    const fast = state.nodes.find(n => n.name === 'fast')
    assert.equal(fast.latencyMs, 20)
    assert.equal(fast.packetLoss, 0)
    assert.ok(fast.stabilityScore > 90, 'single stable sample → high stability')
  } finally {
    balancer.stop()
  }
})

test('a failed probe nulls latency and counts toward packet loss', async () => {
  const { prober, balancer } = makeBalancer({ flaky: [40, null] })
  balancer.configure({ enabled: true, mode: 'latency' })
  await balancer.probeAll(['flaky'])
  let state = balancer.getState()
  assert.equal(state.nodes[0].latencyMs, 40)
  assert.equal(state.nodes[0].packetLoss, 0)

  prober.advance()
  await balancer.probeAll(['flaky'])
  state = balancer.getState()
  const node = state.nodes[0]
  assert.equal(node.latencyMs, null, 'latest failure clears the stale latency')
  assert.equal(node.packetLoss, 0.5)
})

test('failed node never selected while a live one exists', async () => {
  const { prober, balancer, selected } = makeBalancer({ dead: [null, null], alive: [50, 55] })
  balancer.configure({ enabled: true, mode: 'latency' })
  await balancer.probeAll(['dead', 'alive'])
  prober.advance()
  await balancer.probeAll(['dead', 'alive'])

  assert.deepEqual(selected, ['alive'])
})

test('rebalance switches when a better node appears', async () => {
  const { prober, balancer, selected } = makeBalancer({ a: [30, 200], b: [100, 25] })
  balancer.configure({ enabled: true, mode: 'latency' })
  await balancer.probeAll(['a', 'b'])
  assert.deepEqual(selected, ['a'])
  prober.advance()
  await balancer.probeAll(['a', 'b'])
  assert.deepEqual(selected, ['a', 'b'], 'switched to the now-faster node')
  assert.equal(balancer.getState().currentBest, 'b')
})

test('stability mode prefers steady over occasionally-faster', async () => {
  // steady: 50,52 (low jitter); spiky: 10,110 (huge jitter) — spiky has the
  // better LAST latency but worse stabilityScore.
  const { prober, balancer, selected } = makeBalancer({ steady: [50, 52], spiky: [10, 110] })
  balancer.configure({ enabled: true, mode: 'stability' })
  await balancer.probeAll(['steady', 'spiky'])
  prober.advance()
  await balancer.probeAll(['steady', 'spiky'])

  assert.deepEqual(selected, ['steady'])
})

test('probes use the gstatic 204 URL with a bounded timeout', async () => {
  const { prober, balancer } = makeBalancer({ a: [10] })
  balancer.configure({ enabled: true })
  await balancer.probeAll(['a'])
  const call = prober.calls[0]
  assert.equal(call.url, 'http://www.gstatic.com/generate_204')
  assert.ok(call.timeoutMs > 0 && call.timeoutMs <= 10_000)
})

test('stop clears the periodic timer (no probe rounds afterwards)', async () => {
  const { balancer } = makeBalancer({ a: [10] })
  balancer.configure({ enabled: true })
  balancer.start(['a'])
  balancer.stop()
  // Let the immediate first round settle before taking the baseline.
  await new Promise(r => setImmediate(r))
  const before = balancer.getState().nodes[0].probeCount
  await new Promise(r => setTimeout(r, 30))
  assert.equal(balancer.getState().nodes[0].probeCount, before)
})
