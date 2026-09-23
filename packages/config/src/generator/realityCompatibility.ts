import type { ParsedProxy } from '../parser/ParsedProfile'

/** Explicit per-node diagnostic opt-in. Never mutate the subscription/cache. */
export function applyRealityCompatibility(proxies: ParsedProxy[], node?: string | null): ParsedProxy[] {
  if (!node) return proxies
  return proxies.map(proxy => {
    const opts = proxy['reality-opts']
    if (proxy.name !== node || proxy.type !== 'vless' || !opts || typeof opts !== 'object' || Array.isArray(opts)) return proxy
    const reality = { ...opts } as Record<string, unknown>
    delete reality['mldsa65-verify']
    reality['support-x25519mlkem768'] = false
    reality['fragment-client-hello'] = false
    // Retain public-key, short-id, SNI, Vision and classical authentication.
    return { ...proxy, 'reality-opts': reality, 'client-fingerprint': 'chrome' }
  })
}
