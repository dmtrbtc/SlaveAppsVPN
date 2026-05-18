import type { ConfigSource } from '@slave-vpn/provider'
import { normalizeSubscriptionContent } from './subscriptionNormalizer'

const FETCH_TIMEOUT_MS = 30_000
const CACHE_TTL_MS = 5 * 60_000

interface CacheEntry {
  yaml: string
  etag?: string
  fetchedAt: number
}

export class RemnawaveKeySource implements ConfigSource {
  private cache: CacheEntry | null = null

  constructor(
    private readonly accessKey: string,
    private readonly apiBaseUrl: string,
  ) {}

  private get subscriptionUrl(): string {
    return `${this.apiBaseUrl.replace(/\/$/, '')}/sub/${this.accessKey}`
  }

  async fetchYaml(): Promise<string> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.yaml
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mihomo/1.18.7',
        'Accept': 'text/plain, application/x-yaml, */*',
      }
      if (this.cache?.etag) headers['If-None-Match'] = this.cache.etag

      const res = await fetch(this.subscriptionUrl, { headers, signal: controller.signal })

      if (res.status === 304 && this.cache) {
        const refreshed: CacheEntry = { ...this.cache, fetchedAt: Date.now() }
        this.cache = refreshed
        return refreshed.yaml
      }

      if (!res.ok) throw new Error(`Remnawave subscription fetch failed: HTTP ${res.status}`)

      const content = await res.text()
      const normalized = normalizeSubscriptionContent(content)

      const responseEtag = res.headers.get('etag')
      const entry: CacheEntry = {
        yaml: normalized.yaml,
        fetchedAt: Date.now(),
        ...(responseEtag ? { etag: responseEtag } : {}),
      }
      this.cache = entry
      return entry.yaml
    } catch (err) {
      if (this.cache) return this.cache.yaml
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
