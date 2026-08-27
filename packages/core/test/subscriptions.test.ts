import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type {
  SubscriptionEntry, ParsedProxy, SubscriptionFetcher,
} from '../src/subscriptions/types.ts'
import type {
  SubscriptionSourceAdapter, SubscriptionFetchMeta,
} from '../src/subscriptions/createSubscriptionFetcher.ts'

const require = createRequire(import.meta.url)
const {
  aggregateSubscriptionProxies, aggregateSubscriptions, createSubscriptionFetcher,
} = require('../dist/cjs/index.js') as typeof import('../src/subscriptions/index.ts')
const { buildClashYaml, parseProxiesFromYaml } = require('@slave-vpn/config')

function entry(id: string, patch: Partial<SubscriptionEntry> = {}): SubscriptionEntry {
  return {
    id, name: id, type: 'subscription-url', enabled: true,
    autoUpdateMinutes: 360, addedAt: 1, lastFetchedAt: null, lastError: null,
    nodeCount: null, ...patch,
  }
}

function node(name = 'primary', server = 'node.example.com'): ParsedProxy {
  return {
    name, type: 'vless', server, port: 443, securityType: 'reality',
    extra: {
      uuid: '00000000-0000-4000-8000-000000000001', tls: true,
      encryption: 'test-encryption', flow: 'xtls-rprx-vision',
      'reality-opts': { 'public-key': 'test-public-key', 'short-id': '1234abcd' },
    },
  }
}

function fixture(overrides: Partial<SubscriptionSourceAdapter> = {}) {
  const meta: { id: string; patch: SubscriptionFetchMeta }[] = []
  const uas: string[] = []
  const requests: string[] = []
  const source: SubscriptionSourceAdapter = {
    getInput: async (id) => `https://subscription.example/${id}`,
    updateMeta: async (id, patch) => { meta.push({ id, patch }) },
    fetchText: async (input) => { requests.push(input); return buildClashYaml([node()]) },
    fetchTextWithUserAgent: async (_input, ua) => { uas.push(ua); return null },
    ...overrides,
  }
  return { source, fetcher: createSubscriptionFetcher(source), meta, uas, requests }
}

test('URL pipeline preserves primary encryption and records success after recovery attempts', async () => {
  const f = fixture()
  const result = await f.fetcher.fetchEntry(entry('a'))
  assert.equal(result.error, null)
  assert.equal(result.proxies.length, 1)
  assert.equal(result.proxies[0]?.extra.encryption, 'test-encryption')
  assert.deepEqual(result.proxies[0]?.extra['reality-opts'], node().extra['reality-opts'])
  assert.deepEqual(f.requests, ['https://subscription.example/a'])
  assert.deepEqual(f.uas, ['v2rayNG/1.8.5', 'SFA/1.0', 'sing-box/1.11.0'])
  assert.equal(f.meta.length, 1)
  assert.equal(f.meta[0]?.patch.nodeCount, 1)
  assert.equal(f.meta[0]?.patch.lastError, null)
  assert.ok((f.meta[0]?.patch.lastFetchedAt ?? 0) > 0)
})

test('single proxy URI never makes HTTP or alternative-format requests', async () => {
  const f = fixture({
    getInput: async () => 'vless://00000000-0000-4000-8000-000000000001@uri.example:443?security=tls#uri-node',
  })
  const result = await f.fetcher.fetchEntry(entry('uri', { type: 'single-proxy' }))
  assert.equal(result.error, null)
  assert.equal(result.proxies[0]?.server, 'uri.example')
  assert.deepEqual(f.requests, [])
  assert.deepEqual(f.uas, [])
  assert.equal(f.meta[0]?.patch.nodeCount, 1)
})

test('missing input and unsupported types do not fetch or rewrite metadata', async () => {
  const missing = fixture({ getInput: async () => null })
  assert.deepEqual(await missing.fetcher.fetchEntry(entry('missing')), {
    proxies: [], error: 'input missing',
  })
  const unsupported = fixture()
  for (const type of ['provider', 'remnawave-key'] as const) {
    const result = await unsupported.fetcher.fetchEntry(entry(type, { type }))
    assert.match(result.error!, /Unsupported subscription source type/)
    assert.deepEqual(result.proxies, [])
  }
  for (const f of [missing, unsupported]) {
    assert.deepEqual(f.requests, [])
    assert.deepEqual(f.uas, [])
    assert.deepEqual(f.meta, [])
  }
})

test('network or parser failure records only lastError (retains previous success metadata)', async () => {
  for (const fetchText of [
    async () => { throw new Error('network unavailable') },
    async () => 'not a subscription',
  ]) {
    const f = fixture({ fetchText })
    const result = await f.fetcher.fetchEntry(entry('a', { nodeCount: 5, lastFetchedAt: 123 }))
    assert.ok(result.error)
    assert.deepEqual(result.proxies, [])
    assert.deepEqual(f.meta, [{ id: 'a', patch: { lastError: result.error } }])
    assert.deepEqual(f.uas, [])
  }
})

test('Xray recovery dedups Hysteria2 and stops after first useful format', async () => {
  const config = {
    remarks: 'udp-node',
    outbounds: [{
      protocol: 'hysteria', settings: { address: 'udp.example', port: 8443 },
      streamSettings: { hysteriaSettings: { version: 2, auth: 'fixture-password' } },
    }],
  }
  const uas: string[] = []
  const f = fixture({
    fetchTextWithUserAgent: async (_input, ua) => {
      uas.push(ua)
      return JSON.stringify([config, config])
    },
  })
  const result = await f.fetcher.fetchEntry(entry('a'))
  assert.deepEqual(result.proxies.map(p => p.type), ['vless', 'hysteria2'])
  assert.equal(result.proxies[0]?.extra.encryption, 'test-encryption')
  assert.deepEqual(uas, ['v2rayNG/1.8.5'])
  assert.equal(f.meta[0]?.patch.nodeCount, 2)
})

test('malformed/empty alt formats fall through to sing-box; only UDP nodes are appended', async () => {
  const uas: string[] = []
  const f = fixture({
    fetchTextWithUserAgent: async (_input, ua) => {
      uas.push(ua)
      if (ua === 'v2rayNG/1.8.5') return 'not a subscription'
      if (ua === 'SFA/1.0') return null
      return JSON.stringify({ outbounds: [
        { type: 'vless', tag: 'unwanted', server: 'other.example', server_port: 443, uuid: 'other' },
        { type: 'tuic', tag: 'tuic-node', server: 'tuic.example', server_port: 443,
          uuid: '00000000-0000-4000-8000-000000000002', password: 'fixture-password' },
      ] })
    },
  })
  const result = await f.fetcher.fetchEntry(entry('a'))
  assert.deepEqual(result.proxies.map(p => p.type), ['vless', 'tuic'])
  assert.equal(result.proxies[0]?.name, 'primary')
  assert.deepEqual(uas, ['v2rayNG/1.8.5', 'SFA/1.0', 'sing-box/1.11.0'])
})

test('primary UDP nodes suppress recovery; failed optional recovery never loses primary nodes', async () => {
  const hasUdp = fixture({ fetchText: async () => buildClashYaml([
    { ...node(), type: 'hysteria2', extra: { password: 'fixture-password' } },
  ]) })
  assert.equal((await hasUdp.fetcher.fetchEntry(entry('a'))).proxies.length, 1)
  assert.deepEqual(hasUdp.uas, [])

  const failedAlt = fixture({ fetchTextWithUserAgent: async () => { throw new Error('alt failed') } })
  const result = await failedAlt.fetcher.fetchEntry(entry('a'))
  assert.equal(result.error, null)
  assert.equal(result.proxies[0]?.type, 'vless')
  assert.equal(failedAlt.meta[0]?.patch.lastError, null)
})

test('disabled-only source lists reject without fetching', async () => {
  let calls = 0
  const fetcher = { fetchEntry: async () => { calls++; return { proxies: [node()], error: null } } }
  for (const entries of [[], [entry('off', { enabled: false })]]) {
    await assert.rejects(aggregateSubscriptionProxies(entries, fetcher), /No enabled subscriptions/)
  }
  assert.equal(calls, 0)
})

test('Android sequential aggregation awaits metadata, skips disabled entries and retains partial success', async () => {
  const order: string[] = []
  const f = fixture({
    getInput: async (id) => { order.push(`input:${id}`); return id },
    fetchText: async (id) => {
      order.push(`fetch:${id}`)
      if (id === 'bad') throw new Error('offline')
      return buildClashYaml([node()])
    },
    updateMeta: async (id) => { await Promise.resolve(); order.push(`meta:${id}`) },
  })
  const result = await aggregateSubscriptionProxies([
    entry('a'), entry('off', { enabled: false }), entry('bad'), entry('b'),
  ], f.fetcher, { concurrency: 1 })
  assert.deepEqual(order, [
    'input:a', 'fetch:a', 'meta:a', 'input:bad', 'fetch:bad', 'meta:bad',
    'input:b', 'fetch:b', 'meta:b',
  ])
  assert.equal(result.proxies.length, 1)
  assert.equal(result.proxies[0]?.extra['slave-source'], 'a')
  assert.deepEqual(result.perSubscription, { a: 1, bad: 0, b: 0 })
  assert.deepEqual(result.warnings, ['bad: offline'])
})

test('bounded parallel fetches retain source order, unique names and soft-cap warnings', async () => {
  let active = 0
  let peak = 0
  const releases: (() => void)[] = []
  const fetcher: SubscriptionFetcher = {
    fetchEntry: async (e) => {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>(resolve => { releases.push(resolve) })
      active--
      return { proxies: [node('same-name', `${e.id}.example`)], error: null }
    },
  }
  const pending = aggregateSubscriptionProxies([entry('a'), entry('b'), entry('c')], fetcher, {
    concurrency: 2, softCap: 2,
  })
  assert.equal(releases.length, 2)
  releases[1]!()
  // Allow worker b to take c while a remains pending.
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(releases.length, 3)
  releases[2]!()
  releases[0]!()
  const result = await pending
  assert.equal(peak, 2)
  assert.deepEqual(result.proxies.map(p => p.extra['slave-source']), ['a', 'b', 'c'])
  assert.deepEqual(result.proxies.map(p => p.name), ['same-name', 'same-name #2', 'same-name #3'])
  assert.match(result.warnings[0]!, /Soft cap exceeded/)
})

test('default concurrency remains parallel; invalid limits reject before I/O', async () => {
  let calls = 0
  const fetcher = { fetchEntry: async () => { calls++; return { proxies: [node()], error: null } } }
  const pending = aggregateSubscriptionProxies([entry('a'), entry('b')], fetcher)
  assert.equal(calls, 2)
  await pending
  for (const concurrency of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(aggregateSubscriptionProxies([entry('a')], fetcher, { concurrency }), /positive integer/)
  }
  assert.equal(calls, 2)
})

test('all failed or empty sources reject with aggregation diagnostics', async () => {
  const failed = fixture({ fetchText: async () => { throw new Error('offline') } })
  await assert.rejects(aggregateSubscriptionProxies([entry('bad')], failed.fetcher), /bad: offline/)
  await assert.rejects(aggregateSubscriptionProxies([entry('empty')], {
    fetchEntry: async () => ({ proxies: [], error: null }),
  }), /no nodes returned/)
})

test('YAML projection uses the same deduped source list and fetches each source once', async () => {
  const f = fixture()
  const result = await aggregateSubscriptions([entry('a'), entry('b')], f.fetcher, { concurrency: 1 })
  const parsed = parseProxiesFromYaml(result.yaml)
  assert.equal(result.proxies.length, 1)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].extra.encryption, 'test-encryption')
  assert.deepEqual(result.perSubscription, { a: 1, b: 0 })
  assert.deepEqual(f.requests, ['https://subscription.example/a', 'https://subscription.example/b'])
  assert.ok(result.builtAt > 0)
})
