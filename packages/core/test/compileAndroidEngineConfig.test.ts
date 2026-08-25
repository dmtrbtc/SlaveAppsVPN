import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compileAndroidEngineConfig } = require('../dist/cjs/index.js') as {
  compileAndroidEngineConfig: (input: Record<string, unknown>) => Promise<{
    config: string
    proxyCount: number
    warnings: string[]
  }>
}

const proxy = {
  name: 'node-a',
  type: 'vless',
  server: 'node.example.com',
  port: 443,
  securityType: 'tls',
  extra: { uuid: '00000000-0000-4000-8000-000000000001', tls: true },
}

const base = {
  proxies: [proxy],
  vpnMode: 'full',
  dohProvider: { id: 'google' },
  enabledScenarios: [],
  customRules: [],
  ruleLists: [],
  apiSecret: 'test-secret',
}

test('Android compiler owns config, DNS and node anti-loop assembly in core', async () => {
  const result = await compileAndroidEngineConfig(base)

  assert.equal(result.proxyCount, 1)
  assert.match(result.config, /secret: test-secret/)
  assert.match(result.config, /https:\/\/8\.8\.8\.8\/dns-query/)
  assert.match(result.config, /node\.example\.com/)
  assert.match(result.config, /MATCH,SLAVE-SELECT/)
  assert.deepEqual(result.warnings, [])
})

test('full mode does not read geosite categories when no policy needs them', async () => {
  let reads = 0
  await compileAndroidEngineConfig({
    ...base,
    loadAvailableGeoSites: async () => {
      reads += 1
      return ['category-ru']
    },
  })

  assert.equal(reads, 0)
})

test('blocked mode composes shared AI routing and reports unavailable geosite rules', async () => {
  let reads = 0
  const result = await compileAndroidEngineConfig({
    ...base,
    vpnMode: 'blocked',
    aggregationWarnings: ['subscription-b unavailable'],
    ruleLists: [{
      id: 'rkn-domains',
      url: 'https://example.com/rkn.list',
      behavior: 'domain',
      enabled: true,
      intervalHours: 1,
    }],
    loadAvailableGeoSites: async () => {
      reads += 1
      return ['private', 'category-ru']
    },
  })

  assert.equal(reads, 1)
  assert.match(result.config, /accounts\.google\.com/)
  assert.match(result.config, /rkn-domains/)
  assert.ok(result.warnings.includes('subscription-b unavailable'))
  assert.ok(result.warnings.some((warning) => warning.includes('google-gemini')))
})

test('direct custom rules are excluded from fake-ip by the shared compiler', async () => {
  const result = await compileAndroidEngineConfig({
    ...base,
    customRules: [{
      id: 'bank',
      domain: 'bank.example',
      matchType: 'suffix',
      action: 'direct',
    }],
    loadAvailableGeoSites: async () => ['private'],
  })

  assert.match(result.config, /\+\.bank\.example/)
  assert.match(result.config, /DOMAIN-SUFFIX,bank\.example,DIRECT/)
})
