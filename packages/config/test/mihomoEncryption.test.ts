import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// generateMihomoConfig/generateSingboxConfig pull in @slave-vpn/routing + dns,
// whose ESM dist uses extensionless imports that node's ESM loader can't resolve
// directly. Require the package's built CJS bundle instead (the `test` script
// runs `build` first). The pure-string enc tests live in vlessEncryption.test.ts.
const require = createRequire(import.meta.url)
const { generateMihomoConfig, generateSingboxConfig, normalizeSubscriptionContent, parseProxiesFromYaml, parseXrayFinalMaskProfiles, buildXrayFinalMaskSidecar,
  XRAY_FINALMASK_OUTBOUND, mergeXrayFinalMaskEntries } =
  require('../dist/cjs/index.js') as typeof import('../src/index')

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
      spider-x: /
      support-x25519mlkem768: true
`.trim()

const baseSettings = {
  tunEnabled: false as const,
  tunStack: 'gvisor' as const,
  fakeIpEnabled: false,
  dnsOverHttps: 'https://1.1.1.1/dns-query',
  fallbackDns: ['8.8.8.8'],
  mixedPort: 7890,
}

test('Remnawave Xray JSON preserves TCP FinalMask separately from the Mihomo representation', () => {
  const outbound = {
    protocol: 'vless',
    settings: { address: 'node.example', port: 443, id: 'test-id', flow: 'xtls-rprx-vision' },
    streamSettings: {
      network: 'raw',
      security: 'reality',
      finalmask: { tcp: [{ type: 'fragment', settings: { packets: 'tlshello' } }] },
    },
  }
  const input = JSON.stringify([
    { remarks: 'Masked', outbounds: [outbound, { protocol: 'freedom' }] },
    { remarks: 'Unmasked', outbounds: [{ ...outbound, streamSettings: { network: 'raw' } }] },
  ])
  const profiles = parseXrayFinalMaskProfiles(input)
  assert.deepEqual(profiles, [{
    name: 'Masked', server: 'node.example', port: 443, transport: 'tcp', userId: 'test-id', outbound,
  }])
  const credentials = { port: 17891, username: 'test', password: 'synthetic_test_password' }
  const sidecar = buildXrayFinalMaskSidecar(profiles[0], credentials)
  const config = JSON.parse(sidecar.xrayConfig)
  assert.deepEqual(config.outbounds, [outbound])
  assert.deepEqual(config.inbounds, [{
    listen: '127.0.0.1', port: 17891, protocol: 'socks', settings: {
      auth: 'password', accounts: [{ user: credentials.username, pass: credentials.password }], udp: false,
    },
  }])
  assert.deepEqual(sidecar.mihomoProxy, {
    name: 'Masked', type: 'socks5', server: '127.0.0.1', ...credentials, udp: false,
  })
  assert.throws(() => buildXrayFinalMaskSidecar(profiles[0], { ...credentials, password: 'weak' }))
  assert.throws(() => buildXrayFinalMaskSidecar({
    ...profiles[0], outbound: { ...outbound, proxySettings: { tag: 'missing-hop' } },
  }, credentials))

  for (const raw of [input, Buffer.from(input).toString('base64')]) {
    const imported = normalizeSubscriptionContent(raw)
    assert.equal(imported.proxyCount, 1)
    const [node] = parseProxiesFromYaml(imported.yaml)
    assert.deepEqual(node.extra[XRAY_FINALMASK_OUTBOUND], outbound)
    const stripped = { ...node, extra: { uuid: node.extra.uuid } }
    assert.deepEqual(mergeXrayFinalMaskEntries([stripped], [node]), [node])
    const options = { subscriptionYaml: imported.yaml, vpnMode: 'full' as const, settings: baseSettings,
      apiPort: 9090, apiSecret: 'x' }
    assert.throws(() => generateMihomoConfig(options), /FinalMask/)
    const config = generateMihomoConfig({ ...options, finalMaskProxies: new Map([
      [node.name, { ...sidecar.mihomoProxy, name: node.name, type: 'socks5' }],
    ]) })
    assert.equal(parseProxiesFromYaml(config)[0]?.type, 'socks5')
    assert.ok(!config.includes(XRAY_FINALMASK_OUTBOUND))
  }
})

test('VLESS XHTTP survives subscription import and Mihomo compilation', () => {
  const url = new URL('vless://00000000-0000-4000-8000-000000000000@node.example:443#XHTTP')
  url.search = new URLSearchParams({
    type: 'xhttp',
    security: 'reality',
    pbk: 'A'.repeat(43),
    sni: 'node.example',
    fp: 'chrome',
    path: '/test',
    host: 'node.example',
    mode: 'stream-one',
    extra: JSON.stringify({ headers: { 'X-Test': 'value' }, xmux: { maxConcurrency: '4-8', hKeepAlivePeriod: 30 } }),
  }).toString()
  const subscription = normalizeSubscriptionContent(url.href)
  const out = generateMihomoConfig({
    subscriptionYaml: subscription.yaml, vpnMode: 'full', settings: baseSettings,
    apiPort: 9090, apiSecret: 'x',
  })
  const [proxy] = parseProxiesFromYaml(out)
  assert.equal(proxy.transport, 'xhttp')
  assert.deepEqual(proxy.extra['xhttp-opts'], {
    path: '/test', host: 'node.example', mode: 'stream-one',
    headers: { 'X-Test': 'value' },
    'reuse-settings': { 'max-concurrency': '4-8', 'h-keep-alive-period': 30 },
  })
  assert.deepEqual(proxy.extra['reality-opts'], {
    'public-key': 'A'.repeat(43), 'support-x25519mlkem768': true,
  })
})

test('VLESS WebSocket preserves the Host header through subscription import and Mihomo compilation', () => {
  const url = new URL('vless://00000000-0000-4000-8000-000000000000@node.example:443#WebSocket')
  url.search = new URLSearchParams({
    type: 'ws',
    security: 'tls',
    sni: 'node.example',
    path: '/ws/test',
    host: 'web.example',
  }).toString()
  const subscription = normalizeSubscriptionContent(url.href)
  const config = generateMihomoConfig({
    subscriptionYaml: subscription.yaml, vpnMode: 'full', settings: baseSettings,
    apiPort: 9090, apiSecret: 'x',
  })
  const [proxy] = parseProxiesFromYaml(config)
  assert.equal(proxy.transport, 'ws')
  assert.deepEqual(proxy.extra['ws-opts'], {
    path: '/ws/test',
    headers: { Host: 'web.example' },
  })
})

test('FinalMask is reported and excluded from mixed subscriptions', () => {
  const direct = 'vless://00000000-0000-4000-8000-000000000000@node.example:443?type=tcp#Control'
  const masked = direct.replace('#Control', '&fm=%7B%22tcp%22%3A%5B%5D%7D#Masked')
  for (const input of [masked, Buffer.from(masked).toString('base64')]) {
    assert.throws(() => normalizeSubscriptionContent(input), /FinalMask/)
  }
  for (const input of [`${direct}\n${masked}`, Buffer.from(`${direct}\n${masked}`).toString('base64')]) {
    const result = normalizeSubscriptionContent(input)
    assert.equal(result.proxyCount, 1)
    assert.match(result.warnings?.[0] ?? '', /FinalMask/)
    assert.equal(parseProxiesFromYaml(result.yaml)[0].name, 'Control')
  }
})

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

test('mihomo Reality node: client-fingerprint present, NO bare fingerprint (cert-pinning)', () => {
  // utlsFingerprint set → applyUtlsRotation override "always" (the real app path
  // that emitted a bare `fingerprint` and broke every Reality dial in mihomo).
  const out = generateMihomoConfig({
    subscriptionYaml: SUB,
    vpnMode: 'full',
    settings: baseSettings,
    apiPort: 9090,
    apiSecret: 'x',
    utlsFingerprint: 'randomized',
  })
  assert.ok(/client-fingerprint:/.test(out), 'must emit client-fingerprint')
  assert.ok(/client-fingerprint: chrome/.test(out), 'modern Reality ML-KEM must force the compatible chrome fingerprint')
  // A line that is `fingerprint:` NOT preceded by `client-` would be the
  // cert-pinning field mihomo rejects. It must be absent.
  assert.ok(!/(^|\n)[ \t]*fingerprint:/.test(out), 'must NOT emit a bare `fingerprint` field')
  assert.ok(/support-x25519mlkem768: true/.test(out), 'must preserve the modern Reality ML-KEM flag')
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
