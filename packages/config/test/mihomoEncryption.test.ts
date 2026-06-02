import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// generateMihomoConfig/generateSingboxConfig pull in @slave-vpn/routing + dns,
// whose ESM dist uses extensionless imports that node's ESM loader can't resolve
// directly. Require the package's built CJS bundle instead (the `test` script
// runs `build` first). The pure-string enc tests live in vlessEncryption.test.ts.
const require = createRequire(import.meta.url)
const { generateMihomoConfig, generateSingboxConfig } = require('../dist/cjs/index.js') as {
  generateMihomoConfig: (ctx: unknown) => string
  generateSingboxConfig: (ctx: unknown) => string
}

// Synthetic enc string (NOT real key material) — long enough to be a "key".
const ENC =
  'mlkem768x25519plus.native.0rtt.ZZZZ0000zzzz1111-Synthetic_ML_KEM_placeholder_value_for_tests_only_AAaa'

const SUB = `
proxies:
  - name: EncNode
    type: vless
    server: enc.example
    port: 9999
    network: tcp
    udp: true
    uuid: 00000000-0000-4000-8000-000000000000
    encryption: ${ENC}
  - name: RealityNode
    type: vless
    server: re.example
    port: 443
    network: tcp
    udp: true
    uuid: 00000000-0000-4000-8000-000000000000
    flow: xtls-rprx-vision
    tls: true
    servername: re.example
    reality-opts:
      public-key: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      short-id: 0123456789abcdef
`.trim()

const baseSettings = {
  tunEnabled: false as const,
  tunStack: 'gvisor' as const,
  fakeIpEnabled: false,
  dnsOverHttps: 'https://1.1.1.1/dns-query',
  fallbackDns: ['8.8.8.8'],
  mixedPort: 7890,
}

test('mihomo (Android core): enc node is KEPT with the encryption string verbatim', () => {
  const out = generateMihomoConfig({
    subscriptionYaml: SUB,
    vpnMode: 'full',
    settings: baseSettings,
    apiPort: 9090,
    apiSecret: 'x',
  })
  // The whole point of issue #4: Android (mihomo) no longer drops enc nodes.
  assert.ok(out.includes(ENC), 'encryption string must be present verbatim')
  assert.ok(out.includes('EncNode'), 'enc node must be present')
  assert.ok(out.includes('RealityNode'), 'reality node must be present (no regression)')
})

test('sing-box compiler still SKIPS enc nodes (libbox cannot represent them)', () => {
  const out = generateSingboxConfig({
    subscriptionYaml: SUB,
    vpnMode: 'full',
    settings: baseSettings,
    apiPort: 9090,
    apiSecret: 'x',
  })
  const doc = JSON.parse(out)
  const vlessTags = doc.outbounds.filter((o: { type: string }) => o.type === 'vless').map((o: { tag: string }) => o.tag)
  assert.ok(!vlessTags.includes('EncNode'), 'enc node must be skipped by the sing-box compiler')
  assert.ok(vlessTags.includes('RealityNode'), 'non-enc reality node must be kept')
  assert.ok(!out.includes('"encryption"'), 'no encryption field in sing-box JSON')
})
