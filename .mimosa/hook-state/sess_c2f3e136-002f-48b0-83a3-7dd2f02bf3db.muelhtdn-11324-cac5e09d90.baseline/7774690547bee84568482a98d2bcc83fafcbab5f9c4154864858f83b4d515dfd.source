import { buildClashYaml } from '@slave-vpn/config'
import type { SubscriptionEntry, SubscriptionFetcher, AggregationResult, FetchedEntry } from './types.js'
import { aggregateProxies } from './aggregateProxies.js'
import { sortSubscriptionsByPriority } from './sourceOrder.js'

export interface AggregateSubscriptionsResult extends AggregationResult {
  /** Clash YAML ready for the config generator. */
  yaml: string
  builtAt: number
}

export interface AggregateSubscriptionsOptions {
  softCap?: number
  /** Defaults to all enabled sources in parallel. Android uses 1 to preserve
   * request order and avoid concurrent read-modify-write metadata updates. */
  concurrency?: number
}

/**
 * Fetch every enabled subscription via the platform fetcher, then merge with the
 * shared aggregation kernel. YAML projection is available separately below.
 *
 * Android uses this via its data-source adapter. Windows still uses the shared
 * merge kernel directly until its cabinet/cache sources move to this contract.
 * Results retain source order regardless of fetch completion order.
 */
export async function aggregateSubscriptionProxies(
  entries: readonly SubscriptionEntry[],
  fetcher: SubscriptionFetcher,
  opts: AggregateSubscriptionsOptions = {},
): Promise<AggregationResult> {
  const enabled = sortSubscriptionsByPriority(entries).filter((e) => e.enabled)
  if (enabled.length === 0) {
    throw new Error('No enabled subscriptions')
  }

  const concurrency = opts.concurrency ?? enabled.length
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Subscription concurrency must be a positive integer')
  }
  const results: FetchedEntry[] = new Array(enabled.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < enabled.length) {
      const index = nextIndex++
      const entry = enabled[index]!
      const { proxies, error } = await fetcher.fetchEntry(entry)
      results[index] = { entry: { id: entry.id, name: entry.name }, proxies, error }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, enabled.length) }, worker))
  return aggregateProxies(results, opts)
}

/** YAML projection of the same fetch/merge path used for server lists/probes. */
export async function aggregateSubscriptions(
  entries: readonly SubscriptionEntry[],
  fetcher: SubscriptionFetcher,
  opts: AggregateSubscriptionsOptions = {},
): Promise<AggregateSubscriptionsResult> {
  const aggregated = await aggregateSubscriptionProxies(entries, fetcher, opts)
  return {
    ...aggregated,
    yaml: buildClashYaml(aggregated.proxies),
    builtAt: Date.now(),
  }
}
