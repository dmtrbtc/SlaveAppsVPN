import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ConnectionCompatibilityValidator, parseProxyUri } = require('../dist/cjs/index.js') as {
  ConnectionCompatibilityValidator: new () => {
    validate: (proxy: unknown) => {
      compatible: boolean
      issues: Array<{ field?: string; severity: string }>
    }
  }
  parseProxyUri: (uri: string) => unknown
}

test('validator accepts canonical Xray REALITY base64url public key and 8-byte shortId', () => {
  const proxy = parseProxyUri(
    'vless://00000000-0000-4000-8000-000000000000@node.example:443' +
    '?type=tcp&security=reality&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    '&fp=chrome&sni=www.example.com&sid=0123456789abcdef&flow=xtls-rprx-vision#Node',
  )
  const report = new ConnectionCompatibilityValidator().validate(proxy)
  assert.equal(report.compatible, true)
  assert.deepEqual(report.issues.filter(issue => issue.severity === 'error'), [])
})

test('validator rejects REALITY shortId longer than the Xray 8-byte limit', () => {
  const proxy = parseProxyUri(
    'vless://00000000-0000-4000-8000-000000000000@node.example:443' +
    '?type=tcp&security=reality&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    '&fp=chrome&sni=www.example.com&sid=0123456789abcdef00&flow=xtls-rprx-vision#Node',
  )
  const report = new ConnectionCompatibilityValidator().validate(proxy)
  assert.equal(report.compatible, false)
  assert.ok(report.issues.some(issue => issue.field === 'reality-opts.short-id'))
})

test('validator accepts a 1952-byte ML-DSA-65 verify key from pqv', () => {
  const proxy = parseProxyUri(
    'vless://00000000-0000-4000-8000-000000000000@node.example:443' +
    '?type=tcp&security=reality&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    `&fp=chrome&sni=www.example.com&sid=0123&pqv=${'A'.repeat(2603)}#Node`,
  )
  const report = new ConnectionCompatibilityValidator().validate(proxy)
  assert.equal(report.compatible, true)
  assert.deepEqual(report.issues.filter(issue => issue.severity === 'error'), [])
})

test('validator rejects malformed ML-DSA-65 verify keys', () => {
  const proxy = parseProxyUri(
    'vless://00000000-0000-4000-8000-000000000000@node.example:443' +
    '?type=tcp&security=reality&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    '&fp=chrome&sni=www.example.com&sid=0123&pqv=too-short#Node',
  )
  const report = new ConnectionCompatibilityValidator().validate(proxy)
  assert.equal(report.compatible, false)
  assert.ok(report.issues.some(issue => issue.field === 'reality-opts.mldsa65-verify'))
})
