import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveAvailability } from '../src/renderer/src/lib/server-health.ts'
import type { Server } from '@slave-vpn/shared'

const server = { id: 'x', name: 'X', availability: 'online' } as unknown as Server

test('no telemetry → the static availability field is kept', () => {
  assert.equal(effectiveAvailability(server, undefined), 'online')
  assert.equal(effectiveAvailability({ ...server, availability: 'unknown' } as Server, undefined), 'unknown')
})

test('a quarantined node is shown as offline', () => {
  assert.equal(effectiveAvailability(server, { score: 0, consecutiveFailures: 3, quarantined: true }), 'offline')
})

test('two consecutive failures mark the node unstable', () => {
  assert.equal(effectiveAvailability(server, { score: 80, consecutiveFailures: 2, quarantined: false }), 'degraded')
  assert.equal(effectiveAvailability(server, { score: 80, consecutiveFailures: 1, quarantined: false }), 'online',
    'a single failure is tolerated')
})

test('a health score below 50 marks the node unstable even without a streak', () => {
  assert.equal(effectiveAvailability(server, { score: 49, consecutiveFailures: 0, quarantined: false }), 'degraded')
  assert.equal(effectiveAvailability(server, { score: 50, consecutiveFailures: 0, quarantined: false }), 'online')
})

test('a healthy node keeps its online badge', () => {
  assert.equal(effectiveAvailability(server, { score: 95, consecutiveFailures: 0, quarantined: false }), 'online')
})
