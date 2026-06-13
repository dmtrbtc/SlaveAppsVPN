import type { ParsedProxy } from '../parser/ParsedProfile'

/**
 * uTLS fingerprint values accepted by both sing-box and Mihomo
 * (Clash.Meta). `randomized` is the strongest — uTLS randomizes both the
 * Client Hello extension order and the underlying TLS algorithm order on
 * every handshake, so no stable behavioural signature is exposed to DPI.
 */
export type UtlsFingerprint =
  | 'randomized'
  | 'random'
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'edge'
  | 'ios'
  | 'android'
  | '360'
  | 'qq'

export interface ApplyUtlsRotationOptions {
  /**
   * Which fingerprint to write into every proxy.
   * @default 'randomized'
   */
  fingerprint?: UtlsFingerprint
  /**
   * - `'when-missing-or-chrome'` (default) — replace only when the field
   *   is absent or set to plain `'chrome'` (which uTLS treats as a static,
   *   easily-recognised default). Anything the subscription provider set
   *   explicitly (firefox, safari, …) is preserved — they may have pinned
   *   it to match their server expectations.
   * - `'always'` — overwrite regardless. Useful when the user explicitly
   *   picks a fingerprint in Settings.
   * @default 'when-missing-or-chrome'
   */
  override?: 'always' | 'when-missing-or-chrome'
}

const FINGERPRINT_FIELDS = ['client-fingerprint', 'fingerprint'] as const

// REALITY-safe deterministic fingerprint. REALITY needs the uTLS ClientHello to
// carry a CLASSIC X25519 key_share (group 29) so the core can inject its auth
// key into it. `randomized`/`random` randomize the key_share group (and may emit
// a post-quantum X25519MLKEM768 share instead), so mihomo's REALITY client finds
// no X25519 share → logs "nil ecdheKey" and EVERY dial fails. `chrome`
// (HelloChrome_Auto) deterministically includes the classic X25519 share and is
// the canonical REALITY fingerprint. (Ref: sing-box#2084, XTLS REALITY docs.)
const REALITY_SAFE_FINGERPRINT: UtlsFingerprint = 'chrome'
const REALITY_UNSAFE = new Set<string>(['randomized', 'random'])

function readField(proxy: ParsedProxy, key: string): string | undefined {
  const v = (proxy as unknown as Record<string, unknown>)[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** A proxy uses REALITY when it carries a non-empty `reality-opts` object. */
function isRealityProxy(proxy: ParsedProxy): boolean {
  const ro = (proxy as unknown as Record<string, unknown>)['reality-opts']
  if (ro && typeof ro === 'object' && Object.keys(ro as object).length > 0) return true
  // Some sources flag it on the proxy itself.
  return readField(proxy, 'security') === 'reality' || readField(proxy, 'securityType') === 'reality'
}

function shouldRewrite(proxy: ParsedProxy, override: ApplyUtlsRotationOptions['override']): boolean {
  if (override === 'always') return true
  for (const field of FINGERPRINT_FIELDS) {
    const current = readField(proxy, field)
    if (current && current !== 'chrome') return false
  }
  return true
}

/**
 * Walk every proxy entry and stamp ONLY `client-fingerprint` (the Clash-style
 * browser-fingerprint field) with the chosen uTLS profile. Returns a NEW
 * array — the input is not mutated.
 *
 * We must NOT write a bare `fingerprint` field: in Clash/mihomo `fingerprint`
 * means TLS CERTIFICATE PINNING, and mihomo rejects every Reality/TLS dial with
 * "`fingerprint` is used for TLS certificate pinning ... use `client-fingerprint`"
 * — which silently killed all Reality nodes (only the security:none enc node
 * survived). `client-fingerprint` is what both mihomo AND the sing-box compiler
 * (`buildTls` reads `client-fingerprint` first) consume, so it's sufficient and
 * safe. Any pre-existing bare `fingerprint` is stripped when we rewrite.
 */
export function applyUtlsRotation(
  proxies: ParsedProxy[],
  options: ApplyUtlsRotationOptions = {},
): ParsedProxy[] {
  const fingerprint = options.fingerprint ?? 'randomized'
  const override = options.override ?? 'when-missing-or-chrome'

  return proxies.map((proxy) => {
    const reality = isRealityProxy(proxy)

    // REALITY can never use a randomized/random fingerprint (see above) — coerce
    // to a deterministic X25519-bearing one regardless of the user's choice.
    const target: UtlsFingerprint =
      reality && REALITY_UNSAFE.has(fingerprint) ? REALITY_SAFE_FINGERPRINT : fingerprint

    // A REALITY node whose effective fingerprint is currently absent OR a
    // randomized/random value is broken and MUST be rewritten, even under
    // 'when-missing-or-chrome' (which would otherwise preserve a stray
    // randomized value and leave the node dead).
    const current = readField(proxy, 'client-fingerprint') ?? readField(proxy, 'fingerprint')
    const realityNeedsFix = reality && (!current || REALITY_UNSAFE.has(current))

    if (!shouldRewrite(proxy, override) && !realityNeedsFix) return proxy

    const next = { ...proxy, 'client-fingerprint': target } as Record<string, unknown>
    delete next['fingerprint'] // never emit the cert-pinning field
    return next as unknown as ParsedProxy
  })
}
