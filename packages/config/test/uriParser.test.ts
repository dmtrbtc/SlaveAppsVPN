import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProxyUri, parseProxyUriSafe, parseProxyUriList } from '../src/subscription/uriParser.ts'

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')

test('shadowsocks: plain method:password userinfo', () => {
  const link = `ss://${
    encodeURIComponent('aes-256-gcm')
  }:${
    encodeURIComponent('p@ss w0rd')
  }@ss.example.com:8388#MySS`
  const proxy = parseProxyUri(link)
  assert.equal(proxy.type, 'ss')
  assert.equal(proxy.server, 'ss.example.com')
  assert.equal(proxy.port, 8388)
  assert.equal(proxy.extra.cipher, 'aes-256-gcm')
  assert.equal(proxy.extra.password, 'p@ss w0rd')
})

test('shadowsocks: base64 userinfo (legacy SIP002)', () => {
  const link = `ss://${b64('chacha20-ietf-poly1305:secret')}@ss2.example.com:9999/#SS2`
  const proxy = parseProxyUri(link)
  assert.equal(proxy.type, 'ss')
  assert.equal(proxy.server, 'ss2.example.com')
  assert.equal(proxy.port, 9999)
  assert.equal(proxy.extra.cipher, 'chacha20-ietf-poly1305')
  assert.equal(proxy.extra.password, 'secret')
  assert.equal(proxy.name, 'SS2')
})

test('vmess: ws + tls transport mapped to ws-opts/servername', () => {
  const json = {
    ps: 'VM-Node', add: 'vm.example.com', port: '443', id: '12345678-1234-4123-8123-123456789abc',
    aid: '0', net: 'ws', tls: 'tls', host: 'cdn.example.com', path: '/ws',
  }
  const proxy = parseProxyUri(`vmess://${b64(JSON.stringify(json))}`)
  assert.equal(proxy.type, 'vmess')
  assert.equal(proxy.server, 'vm.example.com')
  assert.equal(proxy.port, 443)
  assert.equal(proxy.name, 'VM-Node')
  assert.equal(proxy.extra.uuid, '12345678-1234-4123-8123-123456789abc')
  assert.equal(proxy.extra.cipher, 'auto')
  assert.equal(proxy.extra.tls, true)
  assert.equal(proxy.extra.servername, 'cdn.example.com')
  assert.equal(proxy.extra['ws-opts'].path, '/ws')
  assert.equal(proxy.extra['ws-opts'].headers.Host, 'cdn.example.com')
})

test('vmess: grpc without tls', () => {
  const json = { ps: 'VM-GRPC', add: 'g.example.com', port: '8443', id: 'u-1', net: 'grpc', path: 'svc' }
  const proxy = parseProxyUri(`vmess://${b64(JSON.stringify(json))}`)
  assert.equal(proxy.type, 'vmess')
  assert.equal(proxy.transport, 'grpc')
  assert.equal(proxy.extra['grpc-opts']['grpc-service-name'], 'svc')
  assert.equal(proxy.extra.tls, undefined)
})

test('vmess: invalid base64/JSON throws, safe wrapper returns null', () => {
  assert.throws(() => parseProxyUri('vmess://not-base64-json!!'))
  assert.equal(parseProxyUriSafe('vmess://not-base64-json!!'), null)
})

test('trojan: password, sni, alpn and ws transport', () => {
  const link = 'trojan://secretpw@tj.example.com:443?sni=tj.example.com&alpn=h2%2Chttp%2F1.1&type=ws&host=cdn.tj&path=%2Ftj#TJ'
  const proxy = parseProxyUri(link)
  assert.equal(proxy.type, 'trojan')
  assert.equal(proxy.server, 'tj.example.com')
  assert.equal(proxy.port, 443)
  assert.equal(proxy.extra.password, 'secretpw')
  assert.equal(proxy.extra.sni, 'tj.example.com')
  assert.deepEqual(proxy.extra.alpn, ['h2', 'http/1.1'])
  assert.equal(proxy.extra['ws-opts'].headers.Host, 'cdn.tj')
})

test('parseProxyUriList drops broken links and keeps the valid ones in order', () => {
  const links = [
    'not a link at all',
    'trojan://pw@ok.example.com:443#OK1',
    'vmess://broken!!',
    'trojan://pw2@ok2.example.com:443#OK2',
  ]
  const parsed = parseProxyUriList(links)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].name, 'OK1')
  assert.equal(parsed[1].name, 'OK2')
})

test('vless reality: spx and pqv mapping stays intact (regression guard)', () => {
  const link = 'vless://00000000-0000-4000-8000-000000000001@node.example:11821?type=tcp&security=reality&pbk=' +
    'A'.repeat(43) + '&fp=chrome&sni=www.example.com&sid=a19c&spx=%2F&flow=xtls-rprx-vision#Synthetic'
  const proxy = parseProxyUri(link)
  const ro = proxy.extra['reality-opts']
  assert.equal(ro['public-key'], 'A'.repeat(43))
  assert.equal(ro['short-id'], 'a19c')
  assert.equal(ro['spider-x'], '/')
  assert.equal(proxy.extra['client-fingerprint'], 'chrome')
  assert.equal(proxy.extra.flow, 'xtls-rprx-vision')
})
