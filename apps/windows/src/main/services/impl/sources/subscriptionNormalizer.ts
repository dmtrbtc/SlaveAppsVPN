import { parseProxyLink } from './proxyParser'
import { buildMihomoYaml } from './mihomoYaml'
import type { ProxyEntry } from './mihomoYaml'

export type SubscriptionFormat = 'clash-yaml' | 'base64-links' | 'raw-links'

export interface NormalizedSubscription {
  yaml: string
  format: SubscriptionFormat
  proxyCount: number
}

const PROXY_SCHEME_RE = /^(vless|vmess|trojan|ss|hysteria2?|hy2|tuic):\/\//i

function isLikelyBase64(s: string): boolean {
  const stripped = s.replace(/[\r\n\t ]/g, '')
  return stripped.length >= 32 && /^[A-Za-z0-9+/]+=*$/.test(stripped) && stripped.length % 4 === 0
}

function isClashYaml(content: string): boolean {
  const trimmed = content.trimStart()
  // Common top-level Clash/Mihomo YAML fields
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
    .filter(l => PROXY_SCHEME_RE.test(l))
}

function parseLinksToProxies(links: string[]): ProxyEntry[] {
  const proxies: ProxyEntry[] = []
  for (const link of links) {
    try {
      proxies.push(parseProxyLink(link))
    } catch {
      // Skip malformed links — partial failure tolerance
    }
  }
  return proxies
}

function countProxiesInYaml(yaml: string): number {
  // Count entries inside the proxies: block only.
  // Simple heuristic: extract section between 'proxies:' and the next top-level key.
  const proxySection = yaml.match(/^proxies\s*:\s*\n([\s\S]*?)(?=^\S|\n[a-z-]+\s*:|\n*$)/m)
  const section = proxySection?.[1] ?? ''
  return (section.match(/^[ \t]*-[ \t]+name[ \t]*:/gm) ?? []).length
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function normalizeSubscriptionContent(content: string): NormalizedSubscription {
  const trimmed = content.trim()

  if (!trimmed) throw new Error('Subscription content is empty')

  // 1. Already Clash/Mihomo YAML — pass through
  if (isClashYaml(trimmed)) {
    const proxyCount = countProxiesInYaml(trimmed)
    if (proxyCount === 0) throw new Error('YAML subscription contains no proxies')
    return { yaml: trimmed, format: 'clash-yaml', proxyCount }
  }

  // 2. Raw proxy links (before base64 check — links contain "://" which breaks base64 check)
  const rawLinks = extractProxyLinks(trimmed)
  if (rawLinks.length > 0) {
    const proxies = parseLinksToProxies(rawLinks)
    if (proxies.length === 0) throw new Error('Found proxy links but all failed to parse')
    return { yaml: buildMihomoYaml(proxies), format: 'raw-links', proxyCount: proxies.length }
  }

  // 3. Base64 encoded content
  if (isLikelyBase64(trimmed)) {
    let decoded: string
    try {
      decoded = Buffer.from(trimmed.replace(/[\r\n\t ]/g, ''), 'base64').toString('utf-8')
    } catch {
      throw new Error('Content looks like base64 but failed to decode')
    }

    // Decoded content — recurse one level
    if (isClashYaml(decoded)) {
      const proxyCount = countProxiesInYaml(decoded)
      if (proxyCount === 0) throw new Error('Base64-decoded YAML contains no proxies')
      return { yaml: decoded.trim(), format: 'base64-links', proxyCount }
    }

    const decodedLinks = extractProxyLinks(decoded)
    if (decodedLinks.length > 0) {
      const proxies = parseLinksToProxies(decodedLinks)
      if (proxies.length === 0) throw new Error('Base64 content had proxy links but all failed to parse')
      return { yaml: buildMihomoYaml(proxies), format: 'base64-links', proxyCount: proxies.length }
    }
  }

  throw new Error('Unrecognized subscription format — expected Clash YAML, base64, or proxy links')
}
