/**
 * VLESS Encryption ("vlessenc") — post-quantum ML-KEM-768 / X25519.
 *
 * The `encryption` string a server publishes in its subscription is an OPAQUE
 * credential. The client must pass it to the proxy core VERBATIM — it never
 * generates, recomputes, or "fixes" keys. The ONLY transformation we ever apply
 * is swapping the handshake-prefix block order for the sing-box core (which
 * spells the same handshake in the reverse order). See `transformForSingbox`.
 *
 * String shape (blocks separated by '.'):
 *   <handshake>.<appearance>.<rtt>.[padding...].<base64-key>[.<base64-key>...]
 *
 *   handshake:   Xray-core  -> "mlkem768x25519plus"
 *                sing-box   -> "x25519mlkem768plus"   (REVERSED order, critical)
 *                also "none" (plain VLESS, no encryption)
 *   appearance:  native | xorpub | random        (must match the server)
 *   rtt:         0rtt | 1rtt                      (client choice)
 *   padding:     optional, client-only            (may differ from server)
 *   keys:        one OR MANY base64 segments; the ML-KEM public key is long
 *                (~1.5k chars). NOTHING is truncated by field/buffer length.
 *
 * Parsing is intentionally MINIMAL: we recognise the handshake prefix, the
 * optional appearance, and the optional rtt; everything after that is taken as
 * an opaque tail (padding + keys) and preserved verbatim. This makes any key
 * set — X25519-only, ML-KEM-768-only, or combined/multiple — supported for free.
 */

export const XRAY_HANDSHAKE = 'mlkem768x25519plus'
export const SINGBOX_HANDSHAKE = 'x25519mlkem768plus'

export type EncHandshakeKind = 'xray' | 'singbox' | 'none' | 'unknown'
export type EncAppearance = 'native' | 'xorpub' | 'random'
export type EncRtt = '0rtt' | '1rtt'

const APPEARANCES = new Set<string>(['native', 'xorpub', 'random'])
const RTTS = new Set<string>(['0rtt', '1rtt'])

export interface ParsedVlessEncryption {
  /** The original string, unmodified. */
  raw: string
  /** First block, verbatim. */
  handshake: string
  handshakeKind: EncHandshakeKind
  appearance?: EncAppearance
  rtt?: EncRtt
  /**
   * Everything after the recognised prefix blocks (optional padding + one or
   * more base64 keys), joined back with '.' exactly as received. Opaque.
   */
  tail: string
  /** True when `tail` carries at least one plausible key segment. */
  hasKey: boolean
}

function classifyHandshake(block: string): EncHandshakeKind {
  if (block === XRAY_HANDSHAKE) return 'xray'
  if (block === SINGBOX_HANDSHAKE) return 'singbox'
  if (block === 'none' || block === '') return 'none'
  return 'unknown'
}

/** True if a proxy carries real VLESS encryption (not absent / not "none"). */
export function isEncryptionValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== 'none'
}

/**
 * Minimal structural parse. Returns null for absent / "none" (= plain VLESS).
 * Never throws — unknown shapes return a best-effort struct with the whole
 * string as `handshake`/`tail` so callers can still pass it through verbatim.
 */
export function parseVlessEncryption(value: unknown): ParsedVlessEncryption | null {
  if (!isEncryptionValue(value)) return null
  const raw = value.trim()
  const parts = raw.split('.')

  const handshake = parts[0] ?? ''
  const handshakeKind = classifyHandshake(handshake)

  let idx = 1
  let appearance: EncAppearance | undefined
  let rtt: EncRtt | undefined

  if (parts[idx] !== undefined && APPEARANCES.has(parts[idx]!)) {
    appearance = parts[idx] as EncAppearance
    idx++
  }
  if (parts[idx] !== undefined && RTTS.has(parts[idx]!)) {
    rtt = parts[idx] as EncRtt
    idx++
  }

  const tail = parts.slice(idx).join('.')
  // A key segment is base64/base64url; the shortest meaningful one (X25519 pub)
  // is ~43 chars, but we only sanity-check "non-trivial" to avoid rejecting
  // future/longer formats. Padding tokens are short and contain digits/dashes.
  const hasKey = /[A-Za-z0-9+/_-]{16,}/.test(tail)

  return {
    raw,
    handshake,
    handshakeKind,
    ...(appearance ? { appearance } : {}),
    ...(rtt ? { rtt } : {}),
    tail,
    hasKey,
  }
}

export interface EncryptionValidation {
  ok: boolean
  /** Stable code for UI/telemetry. */
  code?: 'EMPTY_KEY' | 'UNKNOWN_HANDSHAKE' | 'MALFORMED'
  message?: string
}

/**
 * Validate WITHOUT mutating or rejecting valid-but-unusual strings. We only
 * fail when the credential is structurally unusable (e.g. truncated to no key),
 * so the user gets a precise reason instead of a silent connect failure.
 */
export function validateVlessEncryption(value: unknown): EncryptionValidation {
  const parsed = parseVlessEncryption(value)
  if (parsed === null) return { ok: true } // absent / none = plain VLESS, fine

  if (parsed.handshakeKind === 'unknown') {
    return {
      ok: false,
      code: 'UNKNOWN_HANDSHAKE',
      message:
        `Неизвестный режим VLESS Encryption "${parsed.handshake}". ` +
        `Ожидается ${XRAY_HANDSHAKE} (Xray) или ${SINGBOX_HANDSHAKE} (sing-box).`,
    }
  }

  if (!parsed.hasKey) {
    return {
      ok: false,
      code: 'EMPTY_KEY',
      message:
        'Строка VLESS Encryption не содержит ключа (пустой/усечённый хвост ' +
        'после rtt-блока). Ключ ML-KEM длинный — проверьте, что подписка не ' +
        'обрезала его.',
    }
  }

  return { ok: true }
}

/**
 * Transform the handshake prefix for the sing-box core. The appearance, rtt and
 * key tail are preserved EXACTLY; only the first block's word order is swapped:
 *   mlkem768x25519plus.<rest>  <->  x25519mlkem768plus.<rest>
 * Any other handshake (none/unknown) is returned unchanged.
 */
export function transformEncryptionForSingbox(value: string): string {
  const parsed = parseVlessEncryption(value)
  if (parsed === null) return value
  if (parsed.handshakeKind === 'xray') {
    return [SINGBOX_HANDSHAKE, ...value.trim().split('.').slice(1)].join('.')
  }
  // already sing-box order, or none/unknown — leave verbatim
  return value
}
