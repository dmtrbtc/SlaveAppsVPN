import type { ConfigSource } from '@slave-vpn/provider'
import {
  normalizeSubscriptionContent,
  parseProxiesFromYaml,
  parseXrayConfigArray,
  buildClashYaml,
  type ProxyEntry,
} from '@slave-vpn/config'
import { buildSubscriptionHeaders } from './subscriptionHeaders'
import { getLogger } from '../../../logger'

const FETCH_TIMEOUT_MS = 30_000
const CACHE_TTL_MS = 5 * 60_000  // 5 minutes

const FALLBACK_USER_AGENTS = [
  'clash.meta',
  'Mihomo/1.18.7',
  'ClashX/1.8.0',
  'Clash/2.0.4.8 (Windows)',
]

// Mirror of the Android aggregator: panels often serve Hysteria2/TUIC ONLY in
// the v2rayN/Xray array format (absent from clash/sing-box). Recover them
// additively so they appear on Windows too, without disturbing VLESS-enc nodes.
const UDP_PROTOCOLS = new Set(['hysteria2', 'hysteria', 'tuic'])
const ALT_FORMAT_UAS = ['v2rayNG/1.8.5', 'SFA/1.0', 'sing-box/1.11.0']
const nodeKey = (p: ProxyEntry): string => `${p.server}:${p.port}:${p.type}`

interface CacheEntry {
  yaml: string
  etag?: string
  lastModified?: string
  fetchedAt: number
  proxyCount: number
}

export class SubscriptionUrlSource implements ConfigSource {
  private cache: CacheEntry | null = null

  constructor(private readonly url: string) {}

  private async fetchRaw(
    ua: string,
    etag?: string,
    lastModified?: string,
  ): Promise<{ status: number; text: string; etag?: string; lastModified?: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = buildSubscriptionHeaders(ua)
      if (etag) headers['If-None-Match'] = etag
      if (lastModified) headers['If-Modified-Since'] = lastModified

      getLogger().info({
        urlDomain: new URL(this.url).hostname,
        ua,
        hwid: headers['X-HWID'] ? `${headers['X-HWID'].slice(0, 8)}...` : undefined,
        engine: headers['X-Engine'],
        version: headers['X-Client-Version'],
      }, 'subscription fetch')

      const res = await fetch(this.url, { headers, signal: controller.signal })
      const text = res.ok ? await res.text() : ''
      const responseEtag = res.headers.get('etag') ?? undefined
      const responseLastModified = res.headers.get('last-modified') ?? undefined

      return {
        status: res.status,
        text,
        ...(responseEtag ? { etag: responseEtag } : {}),
        ...(responseLastModified ? { lastModified: responseLastModified } : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private isPlaceholderResponse(text: string): boolean {
    return text.includes('App not supported') || text.includes('not supported')
  }

  // Parse an alt-format body: v2rayN/Xray array (carries Hysteria2) OR the
  // clash/sing-box/base64/URI shapes the normalizer understands.
  private parseAltBody(raw: string): ProxyEntry[] {
    const xray = parseXrayConfigArray(raw)
    if (xray.length > 0) return xray
    try { return parseProxiesFromYaml(normalizeSubscriptionContent(raw).yaml) } catch { return [] }
  }

  /**
   * If the primary YAML has no UDP/QUIC nodes (Hysteria2/TUIC), pull an alt
   * format (v2rayN/Xray etc.) and append ONLY the missing UDP nodes by
   * server:port:type. Returns the merged YAML + count, or null if nothing added.
   */
  private async recoverUdpNodes(primaryYaml: string): Promise<{ yaml: string; count: number } | null> {
    const primary = parseProxiesFromYaml(primaryYaml)
    if (primary.some(p => UDP_PROTOCOLS.has(p.type))) return null
    const seen = new Set(primary.map(nodeKey))
    const added: ProxyEntry[] = []
    for (const ua of ALT_FORMAT_UAS) {
      let body = ''
      try {
        const { status, text } = await this.fetchRaw(ua)
        if (status < 200 || status >= 300 || !text.trim() || this.isPlaceholderResponse(text)) continue
        body = text
      } catch { continue }
      for (const p of this.parseAltBody(body)) {
        if (!UDP_PROTOCOLS.has(p.type)) continue
        const k = nodeKey(p)
        if (seen.has(k)) continue
        seen.add(k)
        added.push(p)
      }
      if (added.length > 0) break
    }
    if (added.length === 0) return null
    const all = [...primary, ...added]
    getLogger().info({ recovered: added.length, types: added.map(p => p.type) }, 'recovered UDP-protocol nodes from alt format')
    return { yaml: buildClashYaml(all), count: all.length }
  }

  async fetchYaml(): Promise<string> {
    // Return fresh in-memory cache
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.yaml
    }

    let lastError: unknown

    for (const ua of FALLBACK_USER_AGENTS) {
      try {
        const { status, text, etag, lastModified } = await this.fetchRaw(
          ua,
          this.cache?.etag,
          this.cache?.lastModified,
        )

        // 304 Not Modified — refresh timestamp, return cached
        if ((status === 304) && this.cache) {
          this.cache = { ...this.cache, fetchedAt: Date.now() }
          return this.cache.yaml
        }

        if (status === 404 || status === 403) {
          // Remnawave answers 404/403 when the HWID is unknown or the device
          // limit is exceeded — a distinct, actionable cause vs "no servers".
          getLogger().warn({ ua, status, urlDomain: new URL(this.url).hostname }, 'subscription rejected (HWID/limit)')
          lastError = new Error(
            `HTTP ${status}: подписка отклонила запрос (HWID / лимит устройств). ` +
            `Проверьте лимит устройств в панели.`,
          )
          continue
        }

        if (status < 200 || status >= 300) {
          getLogger().warn({ ua, status, urlDomain: new URL(this.url).hostname }, 'subscription HTTP error')
          lastError = new Error(`HTTP ${status}`)
          continue
        }

        if (!text.trim()) {
          lastError = new Error('Empty response body')
          continue
        }

        if (this.isPlaceholderResponse(text)) {
          lastError = new Error('Subscription returned placeholder data (app not supported by server)')
          continue
        }

        // Atomic update: validate new subscription before replacing cache.
        // If validation fails, stale cache is preserved (rollback).
        let normalized: ReturnType<typeof normalizeSubscriptionContent>
        try {
          normalized = normalizeSubscriptionContent(text)
        } catch (parseErr) {
          // Log first 600 chars of the response to diagnose server-side issues
          getLogger().warn({
            ua,
            status,
            parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
            responsePreview: text.slice(0, 600),
            responseLength: text.length,
          }, 'subscription parse failed')
          // New content is invalid — keep stale cache if available
          lastError = parseErr
          if (this.cache) return this.cache.yaml
          continue
        }

        // Additively recover Hysteria2/TUIC nodes the primary (clash) profile
        // omitted — they live in the v2rayN/Xray format on some panels. Never
        // replaces the primary nodes; best-effort.
        const recovered = await this.recoverUdpNodes(normalized.yaml).catch(() => null)
        const finalYaml = recovered?.yaml ?? normalized.yaml
        const finalCount = recovered?.count ?? normalized.proxyCount

        this.cache = {
          yaml: finalYaml,
          proxyCount: finalCount,
          fetchedAt: Date.now(),
          ...(etag ? { etag } : {}),
          ...(lastModified ? { lastModified } : {}),
        }
        return this.cache.yaml

      } catch (err) {
        lastError = err
        if (err instanceof Error && err.name === 'AbortError') break
      }
    }

    // All UAs failed — fall back to stale cache
    if (this.cache) {
      return this.cache.yaml
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Subscription fetch failed')
  }

  invalidateCache(): void {
    if (this.cache) {
      this.cache = { ...this.cache, fetchedAt: 0 }
    }
  }

  getCachedProxyCount(): number {
    return this.cache?.proxyCount ?? 0
  }
}
