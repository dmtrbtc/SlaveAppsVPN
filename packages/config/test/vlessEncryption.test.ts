import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseVlessEncryption,
  validateVlessEncryption,
  transformEncryptionForSingbox,
  isEncryptionValue,
  XRAY_HANDSHAKE,
  SINGBOX_HANDSHAKE,
} from '../src/encryption/vlessEncryption.ts'
import { parseProxyUri } from '../src/subscription/uriParser.ts'

// Synthetic placeholder keys (base64url charset) — NOT real key material.
// Long enough to satisfy the "has a key" heuristic; values are fabricated.
const KEY = 'ZZZZ0000zzzz1111-Synthetic_ML_KEM_placeholder_value_for_tests_only_AAaa'
const KEY2 = 'XxYy9988-_secondPlaceholderKeySegmentForMultiKeyTests1234567890aabb'

test('isEncryptionValue: absent / none = not encryption', () => {
  assert.equal(isEncryptionValue(undefined), false)
  assert.equal(isEncryptionValue(''), false)
  assert.equal(isEncryptionValue('none'), false)
  assert.equal(isEncryptionValue(' none '), false)
  assert.equal(isEncryptionValue(`${XRAY_HANDSHAKE}.native.0rtt.${KEY}`), true)
})

test('parse: Xray prefix, native, 0rtt, single key', () => {
  const p = parseVlessEncryption(`${XRAY_HANDSHAKE}.native.0rtt.${KEY}`)!
  assert.equal(p.handshakeKind, 'xray')
  assert.equal(p.appearance, 'native')
  assert.equal(p.rtt, '0rtt')
  assert.equal(p.tail, KEY)
  assert.equal(p.hasKey, true)
})

test('parse: sing-box prefix recognised', () => {
  const p = parseVlessEncryption(`${SINGBOX_HANDSHAKE}.xorpub.1rtt.${KEY}`)!
  assert.equal(p.handshakeKind, 'singbox')
  assert.equal(p.appearance, 'xorpub')
  assert.equal(p.rtt, '1rtt')
})

test('parse: MULTIPLE keys preserved verbatim in tail', () => {
  const enc = `${XRAY_HANDSHAKE}.native.0rtt.${KEY}.${KEY2}`
  const p = parseVlessEncryption(enc)!
  assert.equal(p.tail, `${KEY}.${KEY2}`)
  assert.equal(p.hasKey, true)
})

test('parse: optional padding block kept inside opaque tail', () => {
  // padding token "35-50" sits before the key; we do NOT try to interpret it
  const enc = `${XRAY_HANDSHAKE}.native.0rtt.35-50.${KEY}`
  const p = parseVlessEncryption(enc)!
  assert.equal(p.tail, `35-50.${KEY}`)
  assert.equal(p.hasKey, true)
})

test('parse: X25519-only style (still opaque tail)', () => {
  const enc = `${XRAY_HANDSHAKE}.native.1rtt.${KEY}`
  const p = parseVlessEncryption(enc)!
  assert.equal(p.hasKey, true)
})

test('parse: missing appearance/rtt — tail starts right after handshake', () => {
  const p = parseVlessEncryption(`${XRAY_HANDSHAKE}.${KEY}`)!
  assert.equal(p.appearance, undefined)
  assert.equal(p.rtt, undefined)
  assert.equal(p.tail, KEY)
})

test('validate: valid string passes', () => {
  assert.equal(validateVlessEncryption(`${XRAY_HANDSHAKE}.native.0rtt.${KEY}`).ok, true)
  assert.equal(validateVlessEncryption(undefined).ok, true) // plain VLESS
  assert.equal(validateVlessEncryption('none').ok, true)
})

test('validate: truncated (no key after rtt) → EMPTY_KEY', () => {
  const r = validateVlessEncryption(`${XRAY_HANDSHAKE}.native.0rtt.`)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'EMPTY_KEY')
})

test('validate: empty key with only short padding → EMPTY_KEY', () => {
  const r = validateVlessEncryption(`${XRAY_HANDSHAKE}.native.0rtt.1-2`)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'EMPTY_KEY')
})

test('validate: unknown handshake → UNKNOWN_HANDSHAKE', () => {
  const r = validateVlessEncryption(`bogusmode.native.0rtt.${KEY}`)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'UNKNOWN_HANDSHAKE')
})

test('transform: Xray → sing-box swaps ONLY the prefix block, tail verbatim', () => {
  const enc = `${XRAY_HANDSHAKE}.native.0rtt.${KEY}.${KEY2}`
  const out = transformEncryptionForSingbox(enc)
  assert.equal(out, `${SINGBOX_HANDSHAKE}.native.0rtt.${KEY}.${KEY2}`)
  // appearance/rtt/keys unchanged
  assert.ok(out.includes('.native.0rtt.'))
  assert.ok(out.endsWith(`${KEY}.${KEY2}`))
})

test('transform: sing-box string left unchanged (already correct order)', () => {
  const enc = `${SINGBOX_HANDSHAKE}.native.0rtt.${KEY}`
  assert.equal(transformEncryptionForSingbox(enc), enc)
})

test('transform: none/unknown returned unchanged', () => {
  assert.equal(transformEncryptionForSingbox('none'), 'none')
  assert.equal(transformEncryptionForSingbox(`weird.x.${KEY}`), `weird.x.${KEY}`)
})

test('uriParser: vless:// captures encryption param verbatim', () => {
  const enc = `${XRAY_HANDSHAKE}.native.0rtt.${KEY}`
  const uri = `vless://00000000-0000-4000-8000-000000000000@ee.example:9999?encryption=${enc}&type=tcp&security=none#EncNode`
  const proxy = parseProxyUri(uri)
  assert.equal(proxy.type, 'vless')
  assert.equal(proxy.extra.encryption, enc)
})

test('uriParser: type=raw normalised to tcp; encryption=none not captured', () => {
  const uri = `vless://uuid-x@h:443?encryption=none&type=raw&security=none#N`
  const proxy = parseProxyUri(uri)
  assert.equal(proxy.transport, 'tcp')
  assert.equal(proxy.extra.encryption, undefined)
})
