import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIHOMO_LATENCY_TEST_URL,
  MIHOMO_LATENCY_TIMEOUT_MS,
  probeMihomoNodeLatency,
  type NativeDelayProbe,
} from '../src/renderer/src/android/node-latency.ts'

test('disconnected Android does not touch the native core or fabricate latency', async () => {
  let calls = 0
  const probe: NativeDelayProbe = async () => {
    calls += 1
    return { delay: 42 }
  }

  assert.equal(await probeMihomoNodeLatency('Slave-EE', false, probe), null)
  assert.equal(calls, 0)
})

test('connected Android measures the named node through mihomo URLTest', async () => {
  const calls: Parameters<NativeDelayProbe>[0][] = []
  const probe: NativeDelayProbe = async (options) => {
    calls.push(options)
    return { delay: 121.4 }
  }

  assert.equal(await probeMihomoNodeLatency('Slave-EE', true, probe), 121)
  assert.deepEqual(calls, [{
    name: 'Slave-EE',
    url: MIHOMO_LATENCY_TEST_URL,
    timeout: MIHOMO_LATENCY_TIMEOUT_MS,
  }])
})

test('native timeout, invalid values and bridge errors are shown as unavailable', async () => {
  for (const delay of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      await probeMihomoNodeLatency('Slave-PL', true, async () => ({ delay })),
      null,
    )
  }

  assert.equal(
    await probeMihomoNodeLatency('Slave-PL', true, async () => { throw new Error('native failure') }),
    null,
  )
  assert.equal(await probeMihomoNodeLatency('', true, async () => ({ delay: 10 })), null)
})
