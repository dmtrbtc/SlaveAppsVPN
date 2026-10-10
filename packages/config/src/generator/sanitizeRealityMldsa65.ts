import type { ParsedProxy } from '../parser/ParsedProfile'
import { REALITY_MLDSA65_VERIFY_RE } from '../subscription/validator'

export interface Mldsa65SanitizedNode {
  name: string
  /** Character length of the damaged mldsa65-verify value (expected: 2603). */
  length: number
}

/**
 * Strip `reality-opts.mldsa65-verify` values that are not a valid unpadded
 * base64url ML-DSA-65 public key (exactly 2603 chars).
 *
 * The patched mihomo core fatals the ENTIRE config when a single proxy carries
 * a damaged key ("invalid REALITY ML-DSA-65 verify key"), so one chat-mangled
 * `pqv` in a pasted link takes down every other node too. The ML-DSA signature
 * is only an extra certificate-extension check on top of the classical REALITY
 * authentication (verified against Xray 26.9.x: a server with mldsa65Seed
 * accepts clients without mldsa65-verify), so dropping just this field keeps
 * the node fully connectable. Everything else (public-key, short-id, hybrid
 * ML-KEM share, hello fragmentation) is preserved.
 */
export function sanitizeInvalidMldsa65Verify(proxies: ParsedProxy[]): {
  proxies: ParsedProxy[]
  sanitized: Mldsa65SanitizedNode[]
} {
  const sanitized: Mldsa65SanitizedNode[] = []
  const out = proxies.map((proxy) => {
    const opts = proxy['reality-opts']
    if (proxy.type !== 'vless' || !opts || typeof opts !== 'object' || Array.isArray(opts)) {
      return proxy
    }
    const reality = opts as Record<string, unknown>
    const value = reality['mldsa65-verify']
    if (typeof value !== 'string' || value === '' || REALITY_MLDSA65_VERIFY_RE.test(value)) {
      return proxy
    }
    const next = { ...reality }
    delete next['mldsa65-verify']
    sanitized.push({ name: proxy.name, length: value.length })
    return { ...proxy, 'reality-opts': next }
  })
  return { proxies: out, sanitized }
}

/**
 * Import-time notice for a single parsed link: null when the pqv is fine (or
 * absent), otherwise a user-facing warning that the key is damaged but the
 * node stays connectable (verification is dropped at config generation).
 */
export function describeDamagedMldsa65Verify(entry: {
  type: string
  extra: Record<string, unknown>
}): string | null {
  if (entry.type !== 'vless') return null
  const opts = entry.extra['reality-opts']
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return null
  const value = (opts as Record<string, unknown>)['mldsa65-verify']
  if (typeof value !== 'string' || value === '' || REALITY_MLDSA65_VERIFY_RE.test(value)) return null
  return (
    `Ключ проверки ML-DSA (pqv) повреждён: ${value.length} символов вместо 2603. ` +
    'Дополнительная верификация будет отключена, подключение останется рабочим. ' +
    'Рекомендуем запросить у продавца новую ссылку.'
  )
}
