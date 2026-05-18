import type { ConfigSource } from '@slave-vpn/provider'
import { normalizeSubscriptionContent } from './subscriptionNormalizer'

const FETCH_TIMEOUT_MS = 30_000
const CACHE_TTL_MS = 5 * 60_000  // 5 minutes

// Multiple UA strings to try if the primary returns a placeholder
const USER_AGENTS = [
  'clash.meta',
  'Mihomo/1.18.7',
  'ClashX/1.8.0',
  'Clash/2.0.4.8 (Windows)',
]

interface CacheEntry {
  yaml: string
  etag?: string
  fetchedAt: number
}

export class SubscriptionUrlSource implements ConfigSource {
  private cache: CacheEntry | null = null

  constructor(private readonly url: string) {}

  private async fetchRaw(ua: string, etag?: string): Promise<{ status: number; text: string; etag?: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = {
        'User-Agent': ua,
        'Accept': 'text/plain, application/x-yaml, */*',
      }
      if (etag) headers['If-None-Match'] = etag

      const res = await fetch(this.url, { headers, signal: controller.signal })
      const text = res.ok ? await res.text() : ''
      const responseEtag = res.headers.get('etag')
      return {
        status: res.status,
        text,
        ...(responseEtag ? { etag: responseEtag } : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private isPlaceholderResponse(text: string): boolean {
    // Remnawave returns this when UA is not a supported Clash client
    return text.includes('App not supported') || text.includes('not supported')
  }

  async fetchYaml(): Promise<string> {
    // Return in-memory cache if fresh
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.yaml
    }

    let lastError: unknown

    for (const ua of USER_AGENTS) {
      try {
        const { status, text, etag } = await this.fetchRaw(ua, this.cache?.etag)

        if (status === 304 && this.cache) {
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

        // Skip placeholder responses and try next UA
        if (this.isPlaceholderResponse(text)) {
          lastError = new Error('Subscription returned placeholder data (app not supported by server)')
          continue
        }

        const normalized = normalizeSubscriptionContent(text)

        const entry: CacheEntry = { yaml: normalized.yaml, fetchedAt: Date.now(), ...(etag ? { etag } : {}) }
        this.cache = entry
        return entry.yaml
      } catch (err) {
        lastError = err
        // Network error — try next UA if available, otherwise bail
        if (err instanceof Error && err.name === 'AbortError') break
      }
    }

    // Fallback to stale cache on any failure
    if (this.cache) {
      return this.cache.yaml
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Subscription fetch failed')
  }
}
