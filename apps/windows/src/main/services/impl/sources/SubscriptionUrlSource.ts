import type { ConfigSource } from '@slave-vpn/provider'
import { normalizeSubscriptionContent } from '@slave-vpn/config'
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
        url: this.url,
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

        if (status < 200 || status >= 300) {
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
          // New content is invalid — keep stale cache if available
          lastError = parseErr
          if (this.cache) return this.cache.yaml
          continue
        }

        this.cache = {
          yaml: normalized.yaml,
          proxyCount: normalized.proxyCount,
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
