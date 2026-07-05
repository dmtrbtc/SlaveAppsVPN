export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage?: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage ?? `Operation timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

export function isExpired(expiresAt: string | null, bufferMs = 0): boolean {
  if (!expiresAt) return true
  return Date.now() + bufferMs >= new Date(expiresAt).getTime()
}

export function isCacheValid(cachedAt: number, ttlMs: number): boolean {
  return Date.now() - cachedAt < ttlMs
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Parsed `slavevpn://import/...` deep link — the subscription/proxy input and
 * which config-source type to add it as.
 */
export interface ParsedImportLink {
  input: string
  /** 'single-proxy' for a vless:// etc. URI, 'subscription-url' for an http(s) list. */
  type: 'single-proxy' | 'subscription-url'
}

// Standalone single-node URIs (added as one proxy) vs a subscription list URL.
const IMPORT_PROXY_URI_RE = /^(?:vless|vmess|trojan|ss|ssr|hysteria2?|tuic|wireguard|wg):\/\//i

/**
 * Parse the app's import deep link. Accepts both the path form and the query
 * form so a web page can use whichever is convenient:
 *   slavevpn://import/<encodeURIComponent(subUrl)>
 *   slavevpn://import?url=<encodeURIComponent(subUrl)>
 * The payload is URL-decoded (percent-encoding is recommended so a subscription
 * URL's own `?`/`&` survive) and must be an http(s) subscription URL or a
 * supported proxy URI; anything else returns null. Never throws.
 */
export function parseImportDeepLink(raw: unknown): ParsedImportLink | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!/^slavevpn:\/\/import\b/i.test(s)) return null
  let rest = s.slice('slavevpn://import'.length)
  let payload: string
  const q = rest.search(/\?url=/i)
  if (q !== -1) payload = rest.slice(q + '?url='.length)
  else if (rest.startsWith('/')) payload = rest.slice(1)
  else payload = rest
  if (!payload) return null
  let decoded = payload
  try { decoded = decodeURIComponent(payload) } catch { /* keep raw on malformed % */ }
  decoded = decoded.trim()
  if (!decoded) return null
  if (IMPORT_PROXY_URI_RE.test(decoded)) return { input: decoded, type: 'single-proxy' }
  if (/^https?:\/\//i.test(decoded)) return { input: decoded, type: 'subscription-url' }
  return null
}

export function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number,
  backoffMultiplier = 1
): Promise<T> {
  return fn().catch((error: unknown) => {
    if (attempts <= 1) throw error
    return sleep(delayMs).then(() =>
      retry(fn, attempts - 1, delayMs * backoffMultiplier, backoffMultiplier)
    )
  })
}

export function countryCodeToFlag(countryCode: string): string {
  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 0x1f1e0 + char.charCodeAt(0) - 'A'.charCodeAt(0)
  )
  return String.fromCodePoint(...codePoints)
}

// ─── Log redaction ────────────────────────────────────────────────────────────
// Strip credentials from log text before it leaves the app (export / copy /
// share / on-screen). Operates on the OUTGOING copy only — the in-memory ring
// buffer keeps raw lines for local debugging. Best-effort: pattern-based, tuned
// to what actually appears in mihomo + our own connect logs.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// key=value / key: value where the key names a secret (query params, yaml, json).
const SECRET_KV_RE = /\b(password|passwd|pass|token|secret|api[-_]?key|apikey|psk|hwid|uuid|auth|authorization|bearer)\b(["']?\s*[:=]\s*["']?)([^\s"',&}]+)/gi
// Proxy share-links carry the node credentials in the URL — drop the whole thing.
const PROXY_URI_RE = /\b(vless|vmess|trojan|ss|ssr|hysteria2?|tuic|hy2):\/\/\S+/gi
// Subscription/config URLs with an opaque token-ish path or query.
const SUB_URL_RE = /(https?:\/\/[^\s"']+\/(?:sub|subscription|api)\/)[^\s"']+/gi

export function redactSecrets(text: string): string {
  if (!text) return text
  return text
    .replace(PROXY_URI_RE, (m) => `${m.slice(0, m.indexOf('://') + 3)}«скрыто»`)
    .replace(SUB_URL_RE, '$1«скрыто»')
    .replace(SECRET_KV_RE, '$1$2«скрыто»')
    .replace(UUID_RE, (m) => `${m.slice(0, 8)}…«скрыто»`)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}ч ${m}м`
  if (m > 0) return `${m}м ${s}с`
  return `${s}с`
}
