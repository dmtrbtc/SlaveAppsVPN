import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyUtlsRotation } from '../src/utls/applyUtlsRotation.ts'
import type { ParsedProxy } from '../src/parser/ParsedProfile.ts'

// A bare `fingerprint` field on a Clash/mihomo proxy means TLS CERTIFICATE
// PINNING — mihomo then rejects every Reality/TLS dial with
// "`fingerprint` is used for TLS certificate pinning ... use `client-fingerprint`".
// That silently killed all Reality nodes. These tests lock in: rotation writes
// ONLY `client-fingerprint`, never a bare `fingerprint`.

function reality(name: string, fp?: string): ParsedProxy {
  const p: Record<string, unknown> = {
    name, type: 'vless', server: `${name}.example`, port: 443,
    uuid: '00000000-0000-4000-8000-000000000000',
    tls: true, servername: `${name}.example`, flow: 'xtls-rprx-vision',
    'reality-opts': { 'public-key': 'x'.repeat(43), 'short-id': '0123456789abcdef' },
  }
  if (fp) p['client-fingerprint'] = fp
  return p as unknown as ParsedProxy
}

test('rotation writes client-fingerprint and NO bare fingerprint (override always)', () => {
  const out = applyUtlsRotation([reality('nl', 'edge')], { fingerprint: 'randomized', override: 'always' })
  const p = out[0] as unknown as Record<string, unknown>
  assert.equal(p['client-fingerprint'], 'randomized')
  assert.equal('fingerprint' in p, false, 'must NOT emit a bare `fingerprint` (mihomo cert-pinning)')
})

test('rotation strips a pre-existing bare fingerprint when it rewrites', () => {
  const node = reality('fr') as unknown as Record<string, unknown>
  node['fingerprint'] = 'chrome' // simulate a stray cert-pinning field
  const out = applyUtlsRotation([node as unknown as ParsedProxy], { fingerprint: 'randomized', override: 'always' })
  const p = out[0] as unknown as Record<string, unknown>
  assert.equal('fingerprint' in p, false)
  assert.equal(p['client-fingerprint'], 'randomized')
})

test('when-missing-or-chrome preserves a provider-set client-fingerprint and still no bare fingerprint', () => {
  const out = applyUtlsRotation([reality('ee', 'edge')], { fingerprint: 'randomized', override: 'when-missing-or-chrome' })
  const p = out[0] as unknown as Record<string, unknown>
  assert.equal(p['client-fingerprint'], 'edge') // explicit provider value kept
  assert.equal('fingerprint' in p, false)
})
