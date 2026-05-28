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

function readField(proxy: ParsedProxy, key: string): string | undefined {
  const v = (proxy as unknown as Record<string, unknown>)[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
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
 * Walk every proxy entry and stamp `client-fingerprint` (Clash-style) and
 * `fingerprint` (VLESS-URI style) with the chosen uTLS profile. Returns
 * a NEW array — the input is not mutated.
 *
 * Both fields are written for cross-engine compatibility: the sing-box
 * compiler reads either, Mihomo reads `client-fingerprint`.
 */
export function applyUtlsRotation(
  proxies: ParsedProxy[],
  options: ApplyUtlsRotationOptions = {},
): ParsedProxy[] {
  const fingerprint = options.fingerprint ?? 'randomized'
  const override = options.override ?? 'when-missing-or-chrome'

  return proxies.map((proxy) => {
    if (!shouldRewrite(proxy, override)) return proxy
    return {
      ...proxy,
      'client-fingerprint': fingerprint,
      fingerprint,
    } as ParsedProxy
  })
}
