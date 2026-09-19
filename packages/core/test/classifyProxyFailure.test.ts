import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyProxyFailure } from '../src/diagnostics/classifyProxyFailure.ts'

const cases = [
  ['context deadline exceeded', 'timeout'],
  ['connect: network is unreachable', 'network_unreachable'],
  ['read: connection reset by peer', 'connection_reset'],
  ['Selector update error: proxy not exist', 'selector'],
  ['REALITY handshake failed: nil ecdheKey', 'reality'],
  ['failed to use encryption: empty nfsPKeysBytes', 'encryption'],
  ['lookup node.example: no such host', 'dns'],
  ['connect: connection refused', 'connection_refused'],
  ['invalid flow xtls-rprx-direct', 'flow'],
  ['tls: failed to verify certificate', 'tls'],
  ['authentication failed', 'authentication'],
  ['wintun access denied', 'tun'],
] as const

for (const [line, code] of cases) {
  test(`classifies ${code}`, () => assert.equal(classifyProxyFailure(line)?.code, code))
}

test('does not echo sensitive engine text into the user message', () => {
  const classified = classifyProxyFailure('authentication failed token=synthetic-secret')
  assert.equal(classified?.code, 'authentication')
  assert.equal(classified?.userMessage.includes('synthetic-secret'), false)
})
