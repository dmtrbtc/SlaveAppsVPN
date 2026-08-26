import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onlineManager } from '@tanstack/react-query'
import { queryClient } from '../src/renderer/src/lib/query-client.ts'

test('server list and refetch reach the bridge while WebView reports offline', { timeout: 2000 }, async (t) => {
  const wasOnline = onlineManager.isOnline()
  onlineManager.setOnline(false)
  t.after(() => {
    queryClient.clear()
    onlineManager.setOnline(wasOnline)
  })
  let calls = 0
  const options = {
    queryKey: ['servers'],
    queryFn: async () => { calls++; return [{ id: 'node-a' }] },
    retry: false as const,
    gcTime: 0,
  }

  assert.deepEqual(await queryClient.fetchQuery(options), [{ id: 'node-a' }])
  await queryClient.invalidateQueries({ queryKey: ['servers'] })
  assert.deepEqual(await queryClient.fetchQuery(options), [{ id: 'node-a' }])
  assert.equal(calls, 2, 'both initial load and refresh must execute')
  assert.equal(onlineManager.isOnline(), false, 'do not spoof the global online state')
})

test('server bridge errors are returned rather than paused offline', { timeout: 2000 }, async (t) => {
  const wasOnline = onlineManager.isOnline()
  onlineManager.setOnline(false)
  t.after(() => {
    queryClient.clear()
    onlineManager.setOnline(wasOnline)
  })

  await assert.rejects(() => queryClient.fetchQuery({
    queryKey: ['servers'],
    queryFn: async () => { throw new Error('bridge unavailable') },
    retry: false,
    gcTime: 0,
  }), /bridge unavailable/)
  assert.equal(queryClient.getQueryDefaults(['cabinet']).networkMode, undefined)
})
