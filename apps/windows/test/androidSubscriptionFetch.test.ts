import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const config = require('@slave-vpn/config')
const source = readFileSync(new URL('../src/renderer/src/android/native-fetch.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const node = '{name: XHTTP, type: vless, server: node.example, port: 443, network: xhttp, uuid: test-id}'
const indentless = `proxies:\n- ${node}\nproxy-groups: []\n`
const fallback = 'vless://00000000-0000-4000-8000-000000000001@fallback.example:443#Fallback'

function createFetcher(bodies: Array<string | Error | { status: number; data: string }>) {
  const userAgents: string[] = []
  const module = { exports: {} as { fetchSubscriptionText(url: string): Promise<string> } }
  runInNewContext(compiled, {
    exports: module.exports,
    require(specifier: string) {
      if (specifier === '@capacitor/core') return {
        Capacitor: { isNativePlatform: () => true },
        CapacitorHttp: { get: async ({ headers }: { headers: Record<string, string> }) => {
          userAgents.push(headers['User-Agent'] ?? '')
          const result = bodies[userAgents.length - 1] ?? ''
          if (result instanceof Error) throw result
          return typeof result === 'string' ? { status: 200, data: result } : result
        } },
      }
      if (specifier === './device-id') return { getDeviceHeaders: () => ({}) }
      if (specifier === '@slave-vpn/config') return config
      throw new Error(`Unexpected dependency ${specifier}`)
    },
  })
  return { fetch: module.exports.fetchSubscriptionText, userAgents }
}

test('Android keeps valid indentless Clash YAML instead of falling back to a smaller format', async () => {
  const fetcher = createFetcher([indentless, fallback])
  const body = await fetcher.fetch('https://subscription.example/test')
  assert.equal(body, indentless)
  assert.deepEqual(fetcher.userAgents, ['clash.meta'])
  assert.equal(config.parseProxiesFromYaml(body)[0].transport, 'xhttp')
})

test('Android retries the preferred format once after a transient network or server failure', async () => {
  for (const failure of [new Error('network changed'), ...[0, 408, 502, 503].map(status => ({ status, data: '' }))]) {
    const fetcher = createFetcher([failure, indentless, fallback])
    assert.equal(await fetcher.fetch('https://subscription.example/test'), indentless)
    assert.deepEqual(fetcher.userAgents, ['clash.meta', 'clash.meta'])
  }
})

test('Android still falls back after two failed preferred-format requests', async () => {
  const fetcher = createFetcher([new Error('network changed'), { status: 503, data: '' }, fallback])
  assert.equal(await fetcher.fetch('https://subscription.example/test'), fallback)
  assert.deepEqual(fetcher.userAgents, ['clash.meta', 'clash.meta', 'sing-box/1.11.0'])
})

test('Android does not retry a denied, rate-limited or malformed preferred response', async () => {
  for (const status of [403, 404, 429]) {
    const fetcher = createFetcher([{ status, data: '' }, fallback])
    assert.equal(await fetcher.fetch('https://subscription.example/test'), fallback)
    assert.deepEqual(fetcher.userAgents, ['clash.meta', 'sing-box/1.11.0'])
  }
})

test('Android only retries the preferred format, keeping the fallback sequence bounded', async () => {
  const fetcher = createFetcher(['proxies: []', new Error('network changed'), 'proxies: []', fallback])
  assert.equal(await fetcher.fetch('https://subscription.example/test'), fallback)
  assert.deepEqual(fetcher.userAgents, ['clash.meta', 'sing-box/1.11.0', 'v2rayNG/1.8.5', 'SFA/1.0'])
})

test('Android accepts an indented Clash list and an inline YAML list', async () => {
  for (const body of [`proxies:\n  - ${node}\n`, `proxies: [${node}]\n`]) {
    const fetcher = createFetcher([body, fallback])
    assert.equal(await fetcher.fetch('https://subscription.example/test'), body)
    assert.deepEqual(fetcher.userAgents, ['clash.meta'])
  }
})

test('Android retries another format for empty, malformed or non-subscription responses', async () => {
  for (const body of ['proxies: []', 'proxies:\n- broken', 'proxies: [', '<html>temporary error</html>']) {
    const fetcher = createFetcher([body, fallback])
    assert.equal(await fetcher.fetch('https://subscription.example/test'), fallback)
    assert.deepEqual(fetcher.userAgents, ['clash.meta', 'sing-box/1.11.0'])
  }
})

test('Android continues past Xray arrays whose full proxy list is not supported by the primary parser', async () => {
  const body = JSON.stringify([{ remarks: 'node', outbounds: [{ protocol: 'vless', settings: {} }] }])
  const fetcher = createFetcher([body, indentless, fallback])
  assert.equal(await fetcher.fetch('https://subscription.example/test'), indentless)
  assert.deepEqual(fetcher.userAgents, ['clash.meta', 'sing-box/1.11.0'])
})
