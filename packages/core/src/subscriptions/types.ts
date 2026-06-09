import type { ProxyEntry as ParsedProxy } from '@slave-vpn/config'

// Re-export the parser node type under an unambiguous name. NOTE: this is the
// *parsed subscription node* (has `extra`), distinct from core's engine/UI-list
// ProxyEntry in ../types.ts. Aggregation works on ParsedProxy.
export type { ParsedProxy }

export type SubscriptionSourceType =
  | 'subscription-url'
  | 'single-proxy'
  | 'remnawave-key'
  | 'provider'

export type SubscriptionAutoUpdate = 0 | 15 | 60 | 360 | 1440

/** Canonical subscription list entry — unifies Windows SubscriptionEntry and
 * Android AndroidSubscriptionEntry (identical shape today). */
export interface SubscriptionEntry {
  id: string
  name: string
  type: SubscriptionSourceType
  enabled: boolean
  autoUpdateMinutes: SubscriptionAutoUpdate
  addedAt: number
  lastFetchedAt: number | null
  lastError: string | null
  nodeCount: number | null
  urlDomain?: string
  proxyProtocol?: string
}

/** Result of fetching+parsing one subscription entry. */
export interface FetchedEntry {
  entry: Pick<SubscriptionEntry, 'id' | 'name'>
  proxies: ParsedProxy[]
  error: string | null
}

/** Platform-specific subscription fetcher (Windows ConfigSource / Android
 * CapacitorHttp + UDP recovery). The core orchestrates these; it never fetches
 * directly so HWID headers / UA rotation / CORS handling stay platform-owned. */
export interface SubscriptionFetcher {
  fetchEntry(entry: SubscriptionEntry): Promise<{ proxies: ParsedProxy[]; error: string | null }>
}

export interface AggregationResult {
  proxies: ParsedProxy[]
  /** entry id → node count after dedup */
  perSubscription: Record<string, number>
  warnings: string[]
}
