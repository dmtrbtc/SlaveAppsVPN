import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryEmptyHydration } from '../src/renderer/src/stores/empty-hydration-retry.ts'

test('empty hydration retries with backoff and stops as soon as data appears', async () => {
  let empty = true
  let reads = 0
  const delays: number[] = []
  await retryEmptyHydration(async () => {
    reads++
    if (reads === 2) empty = false
  }, () => empty, {
    delaysMs: [10, 20, 30, 40],
    delay: async ms => { delays.push(ms) },
  })
  assert.equal(reads, 2)
  assert.deepEqual(delays, [10, 20])
})

test('empty hydration stops before reading when the consumer is disposed', async () => {
  let active = true
  let reads = 0
  await retryEmptyHydration(async () => { reads++ }, () => active, {
    delaysMs: [10, 20],
    delay: async () => { active = false },
  })
  assert.equal(reads, 0)
})

test('empty hydration uses every bounded retry when state remains empty', async () => {
  let reads = 0
  const delays: number[] = []
  await retryEmptyHydration(async () => { reads++ }, () => true, {
    delaysMs: [10, 20, 30],
    delay: async ms => { delays.push(ms) },
  })
  assert.equal(reads, 3)
  assert.deepEqual(delays, [10, 20, 30])
})
