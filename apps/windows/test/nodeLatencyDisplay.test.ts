import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveNodeLatency } from '../src/renderer/src/lib/node-latency.ts'

test('a failed probe must replace an old successful ping', () => {
  assert.equal(resolveNodeLatency(42, 69), 42)
  assert.equal(resolveNodeLatency(null, 69), null)
  assert.equal(resolveNodeLatency(undefined, 69), 69)
})

test('engine failure sentinel and invalid values cannot be displayed as ping', () => {
  for (const value of [-1, 65535, 70000, NaN, Infinity]) {
    assert.equal(resolveNodeLatency(value, 69), null)
    assert.equal(resolveNodeLatency(undefined, value), null)
  }
  assert.equal(resolveNodeLatency(0, 69), 0)
})
