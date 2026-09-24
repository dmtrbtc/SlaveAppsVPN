import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPrereleaseVersion,
  effectiveUpdateChannel,
} from '../src/renderer/src/lib/update-channel.ts'

test('prerelease suffix detection covers our tag scheme', () => {
  assert.equal(isPrereleaseVersion('0.2.41-dev.18'), true)
  assert.equal(isPrereleaseVersion('0.2.41-dev.1'), true)
  assert.equal(isPrereleaseVersion('1.0.0-rc.1'), true)
  assert.equal(isPrereleaseVersion('1.0.0-alpha.3'), true)
  assert.equal(isPrereleaseVersion('1.0.0-beta.2'), true)
  assert.equal(isPrereleaseVersion('0.2.41'), false)
  assert.equal(isPrereleaseVersion('1.0.0'), false)
  assert.equal(isPrereleaseVersion(''), false)
  // stable-with-suffix-like-domain must not false-positive
  assert.equal(isPrereleaseVersion('0.2.41-devtools'), false)
})

test('a prerelease build resolves to the beta channel even on stored stable', () => {
  assert.equal(effectiveUpdateChannel('stable', '0.2.41-dev.17'), 'beta')
  assert.equal(effectiveUpdateChannel('stable', '1.0.0-rc.2'), 'beta')
})

test('release builds keep the stored channel', () => {
  assert.equal(effectiveUpdateChannel('stable', '0.2.41'), 'stable')
  assert.equal(effectiveUpdateChannel('stable', ''), 'stable')
})

test('an explicit beta preference is never downgraded', () => {
  assert.equal(effectiveUpdateChannel('beta', '0.2.41'), 'beta')
  assert.equal(effectiveUpdateChannel('beta', '0.2.41-dev.9'), 'beta')
})
