import { isProxyUri, parseProxyUri, parseProxyUriList } from './uriParser'
import { isSingBoxJson, parseSingBoxJson } from './singboxParser'
import { buildClashYaml } from './clashYamlBuilder'
import type { NormalizedSubscription, SubscriptionFormat } from './types'

// ─── Format detection ─────────────────────────────────────────────────────────

/**
 * Decode base64 in BOTH Node (Windows main process) and the browser/Android
 * WebView. Node has `Buffer`; the WebView does not, so fall back to atob +
 * TextDecoder. Remnawave often strips padding, so we re-pad before decoding.
 */
function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/[\r\n\t ]/g, '')
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(clean, 'base64').toString('utf-8')
  }
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  // eslint-disable-next-line no-undef
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function isLikelyBase64(s: string): boolean {
  const stripped = s.replace(/[\r\n\t ]/g, '')
  // Require minimum length and valid base64 charset
  // Allow both padded and unpadded (Telegram/some servers strip padding)
  return stripped.length >= 32 && /^[A-Za-z0-9+/]+=*$/.test(stripped)
}

function isClashYaml(content: string): boolean {
  const trimmed = content.trimStart()
  return (
    /^proxies\s*:/m.test(trimmed) ||
    /^mixed-port\s*:/m.test(trimmed) ||
    /^port\s*:/m.test(trimmed) ||
    /^socks-port\s*:/m.test(trimmed) ||
    /^redir-port\s*:/m.test(trimmed)
  )
}

function extractProxyLinks(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => isProxyUri(l))
}

// ─── Count proxies strictly within the proxies: block ────────────────────────

function countProxiesInYaml(yaml: string): number {
  // Line scan rather than one big regex: a proxy can carry a very long single
  // line (e.g. a ~1.6k-char VLESS `encryption:` ML-KEM key) that broke the
  // previous lookahead-based section match and under-counted nodes.
  const lines = yaml.split('\n')
  let inProxies = false
  let count = 0
  for (const line of lines) {
    if (/^proxies\s*:/.test(line)) { inProxies = true; continue }
    if (!inProxies) continue
    // A non-indented, non-list, non-comment line starts the next top-level key.
    if (/^[^\s#-]/.test(line)) break
    if (/^\s*-\s+name\s*:/.test(line) || /^\s*-\s*\{/.test(line)) count++
  }
  return count
}

// ─── Core normalization logic ─────────────────────────────────────────────────

function normalizeText(content: string): NormalizedSubscription {
  const trimmed = content.trim()

  if (!trimmed) throw new Error('Subscription content is empty')

  // 1. Clash/Mihomo YAML
  if (isClashYaml(trimmed)) {
    const proxyCount = countProxiesInYaml(trimmed)
    if (proxyCount === 0) throw new Error('YAML subscription contains no proxies')
    return { yaml: trimmed, format: 'clash-yaml', proxyCount }
  }

  // 2. Sing-box JSON
  if (isSingBoxJson(trimmed)) {
    const proxies = parseSingBoxJson(trimmed)
    if (proxies.length === 0) throw new Error('Sing-box JSON contains no recognized proxy outbounds')
    return { yaml: buildClashYaml(proxies), format: 'singbox-json', proxyCount: proxies.length }
  }

  // 3. Raw proxy URI list (must check before base64 — URIs contain :// which fails base64)
  const rawLinks = extractProxyLinks(trimmed)
  if (rawLinks.length > 0) {
    const proxies = parseProxyUriList(rawLinks)
    if (proxies.length === 0) throw new Error('Found proxy URIs but all failed to parse')
    return { yaml: buildClashYaml(proxies), format: 'raw-links', proxyCount: proxies.length }
  }

  // 4. Base64-encoded content
  if (isLikelyBase64(trimmed)) {
    let decoded: string
    try {
      decoded = decodeBase64Utf8(trimmed)
    } catch {
      throw new Error('Content looks like base64 but failed to decode')
    }

    // Single proxy URI encoded as base64 (rare but seen in some apps).
    // Guard against multi-line blobs: isProxyUri() only checks the leading
    // scheme, so a base64 that decodes to SEVERAL newline-separated vless://
    // links would otherwise be misread as one giant URI (the #fragment name
    // swallowing every subsequent link). Only take this path for a true
    // single-line URI; multi-link blobs fall through to normalizeDecoded().
    const decodedTrimmed = decoded.trim()
    if (!/[\r\n]/.test(decodedTrimmed) && isProxyUri(decodedTrimmed)) {
      try {
        const entry = parseProxyUri(decodedTrimmed)
        return { yaml: buildClashYaml([entry]), format: 'base64-links', proxyCount: 1 }
      } catch { /* fall through */ }
    }

    return normalizeDecoded(decoded)
  }

  throw new Error('Unrecognized subscription format — expected Clash YAML, sing-box JSON, base64, or proxy URIs')
}

function normalizeDecoded(decoded: string): NormalizedSubscription {
  const trimmed = decoded.trim()
  let format: SubscriptionFormat = 'base64-links'

  if (isClashYaml(trimmed)) {
    const proxyCount = countProxiesInYaml(trimmed)
    if (proxyCount === 0) throw new Error('Base64-decoded YAML contains no proxies')
    return { yaml: trimmed, format, proxyCount }
  }

  if (isSingBoxJson(trimmed)) {
    const proxies = parseSingBoxJson(trimmed)
    if (proxies.length === 0) throw new Error('Base64-decoded sing-box JSON has no proxy outbounds')
    return { yaml: buildClashYaml(proxies), format, proxyCount: proxies.length }
  }

  const decodedLinks = extractProxyLinks(trimmed)
  if (decodedLinks.length > 0) {
    const proxies = parseProxyUriList(decodedLinks)
    if (proxies.length === 0) throw new Error('Base64 content had proxy URIs but all failed to parse')
    return { yaml: buildClashYaml(proxies), format, proxyCount: proxies.length }
  }

  throw new Error('Base64-decoded content is not a recognized subscription format')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function normalizeSubscriptionContent(content: string): NormalizedSubscription {
  return normalizeText(content)
}
