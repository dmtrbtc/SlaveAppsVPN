import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildDnsProfileConfig, compileAndroidEngineConfig, createAndroidEngineConfigProvider } = require('../dist/cjs/index.js') as {
  buildDnsProfileConfig: (preset: string, custom: Record<string, unknown> | null) => Record<string, unknown>
  compileAndroidEngineConfig: (input: Record<string, unknown>) => Promise<{
    config: string
    proxyCount: number
    warnings: string[]
  }>
  createAndroidEngineConfigProvider: (source: Record<string, unknown>) => {
    compile(): Promise<{ config: string; proxyCount: number; warnings: string[] }>
  }
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
  dnsPreset: 'secure',
  dnsStrategy: 'prefer_ipv4',
  customDnsProfile: null,
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
  assert.doesNotMatch(result.config, /#h3=true/)
  assert.match(result.config, /node\.example\.com/)
  assert.match(result.config, /MATCH,SLAVE-SELECT/)
  assert.match(result.config, /^mode: rule$/m)
  assert.ok(
    result.config.indexOf('DOMAIN-SUFFIX,node.example.com,DIRECT') <
      result.config.indexOf('MATCH,SLAVE-SELECT'),
    'node anti-loop rule must precede the proxy catch-all',
  )
  assert.deepEqual(result.warnings, [])
})

test('Android split stays proxy-default after removing legacy androidRouting', async () => {
  const result = await compileAndroidEngineConfig({ ...base, vpnMode: 'split' })

  assert.match(result.config, /DOMAIN-SUFFIX,node\.example\.com,DIRECT/)
  assert.match(result.config, /MATCH,SLAVE-SELECT/)
  assert.doesNotMatch(result.config, /MATCH,DIRECT/)
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

test('Android compiler applies the selected shared DNS preset and strategy', async () => {
  const minimal = await compileAndroidEngineConfig({
    ...base,
    dnsPreset: 'minimal',
    dnsStrategy: 'ipv6_only',
  })

  assert.match(minimal.config, /enhanced-mode: redir-host/)
  assert.match(minimal.config, /^ipv6: true$/m)
  assert.match(minimal.config, /^  ipv6: true$/m)
  assert.doesNotMatch(minimal.config, /fake-ip-range:/)
})

test('Android compiler preserves advanced DNS resolvers, rules and prefetch', async () => {
  const result = await compileAndroidEngineConfig({
    ...base,
    dnsPreset: 'secure',
    customDnsProfile: {
      preset: 'secure',
      primaryDoh: 'https://8.8.8.8/dns-query',
      fallbackDns: ['tls://1.1.1.1'],
      fakeIpEnabled: true,
      ipv6Enabled: false,
      bootstrapDns: ['8.8.8.8'],
      customResolvers: [{ id: 'custom-doh', type: 'doh', url: 'https://9.9.9.9/dns-query', preferH3: true }],
      customRules: [{ id: 'example', matchType: 'domain_suffix', value: 'example.org', resolverTag: 'primary' }],
      prefetchDomains: ['example.org'],
    },
  })

  assert.match(result.config, /https:\/\/9\.9\.9\.9\/dns-query/)
  assert.match(result.config, /https:\/\/9\.9\.9\.9\/dns-query#h3=true/)
  assert.match(result.config, /\+\.example\.org/)
  assert.match(result.config, /prefetch-domain:/)
  assert.match(result.config, /- example\.org/)
})

test('DNS preset switching preserves advanced profile overlays', () => {
  const advanced = {
    preset: 'custom',
    primaryDoh: 'https://9.9.9.9/dns-query',
    fallbackDns: [],
    fakeIpEnabled: true,
    ipv6Enabled: false,
    bootstrapDns: [],
    customResolvers: [{ id: 'custom', type: 'doh', url: 'https://9.9.9.9/dns-query' }],
    customRules: [{ id: 'rule', matchType: 'domain', value: 'example.org', resolverTag: 'primary' }],
    prefetchDomains: ['example.org'],
  }

  const profile = buildDnsProfileConfig('balanced', advanced)

  assert.equal(profile.preset, 'balanced')
  assert.deepEqual(profile.customResolvers, advanced.customResolvers)
  assert.deepEqual(profile.customRules, advanced.customRules)
  assert.deepEqual(profile.prefetchDomains, advanced.prefetchDomains)
})

test('typed Android provider owns platform-source collection before compilation', async () => {
  const calls: string[] = []
  const provider = createAndroidEngineConfigProvider({
    loadProxies: async () => {
      calls.push('proxies')
      return { proxies: [proxy], warnings: ['cached subscription used'] }
    },
    loadState: async () => {
      calls.push('state')
      return {
        vpnMode: 'full',
        dohProvider: { id: 'google' },
        dnsPreset: 'secure',
        dnsStrategy: 'prefer_ipv4',
        customDnsProfile: null,
        enabledScenarios: [],
        customRules: [],
        ruleLists: [],
      }
    },
    createApiSecret: () => {
      calls.push('secret')
      return 'provider-secret'
    },
    loadAvailableGeoSites: async () => {
      calls.push('geosite')
      return ['private']
    },
  })

  const result = await provider.compile()

  assert.deepEqual(calls, ['state', 'proxies', 'secret'])
  assert.match(result.config, /secret: provider-secret/)
  assert.equal(result.proxyCount, 1)
  assert.ok(result.warnings.includes('cached subscription used'))
})
