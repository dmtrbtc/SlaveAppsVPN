const assert = require('node:assert/strict')

function assertFreshSmokeTarget({ state, localSettings, nativeSettings, localSubscriptions, nativeSubscriptions }) {
  assert.equal(state, 'disconnected', 'Refusing smoke: VPN is active or its state is unknown')
  assert.ok(localSettings === null, 'Refusing smoke: existing local settings')
  assert.ok(nativeSettings === null, 'Refusing smoke: existing native settings')
  for (const value of [localSubscriptions, nativeSubscriptions]) {
    if (value === null) continue
    let entries
    try { entries = JSON.parse(value) } catch { throw new Error('Refusing smoke: invalid subscriptions') }
    assert.ok(Array.isArray(entries) && entries.length === 0, 'Refusing smoke: existing or invalid subscriptions')
  }
}

module.exports = { assertFreshSmokeTarget }
