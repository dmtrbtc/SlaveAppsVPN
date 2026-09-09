const { test } = require('node:test')
const assert = require('node:assert/strict')
const { assertFreshSmokeTarget } = require('./android-smoke-preflight.cjs')
const fresh = { state: 'disconnected', localSettings: null, nativeSettings: null, localSubscriptions: null, nativeSubscriptions: null }

test('allows an empty disconnected target', () => {
  assertFreshSmokeTarget(fresh)
  assertFreshSmokeTarget({ ...fresh, localSubscriptions: '[]', nativeSubscriptions: '[]' })
})
test('rejects active and unknown VPN states', () => {
  for (const state of ['connected', 'connecting', 'error', undefined]) {
    assert.throws(() => assertFreshSmokeTarget({ ...fresh, state }), /Refusing smoke/)
  }
})
test('rejects settings in either storage without exposing their contents', () => {
  for (const key of ['localSettings', 'nativeSettings']) {
    assert.throws(() => assertFreshSmokeTarget({ ...fresh, [key]: 'private-value' }), error => {
      assert.doesNotMatch(String(error), /private-value/)
      return /Refusing smoke/.test(String(error))
    })
  }
})
test('rejects populated or malformed subscriptions in either storage', () => {
  for (const key of ['localSubscriptions', 'nativeSubscriptions']) {
    for (const value of ['[{"id":"synthetic"}]', '{}', 'null', 'invalid-private-value']) {
      assert.throws(() => assertFreshSmokeTarget({ ...fresh, [key]: value }), error => {
        assert.doesNotMatch(String(error), /invalid-private-value/)
        return /Refusing smoke/.test(String(error))
      })
    }
  }
})
