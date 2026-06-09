import { buildClashYaml } from '@slave-vpn/config'
import type { SubscriptionEntry, SubscriptionFetcher, AggregationResult } from './types.js'
import { aggregateProxies } from './aggregateProxies.js'

export interface AggregateSubscriptionsResult extends AggregationResult {
  /** Clash YAML ready for the config generator. */
  yaml: string
  builtAt: number
}

/**
 * Fetch every enabled subscription via the platform fetcher, then merge with the
 * shared aggregation kernel and emit a Clash YAML.
 *
 * This is the single orchestration both platforms call (Windows via a
 * ConfigSource-backed fetcher, Android via a CapacitorHttp-backed one), replacing
 * the two parallel aggregators. Fetches run concurrently.
 */
export async function aggregateSubscriptions(
  entries: readonly SubscriptionEntry[],
  fetcher: SubscriptionFetcher,
  opts: { softCap?: number } = {},
): Promise<AggregateSubscriptionsResult> {
  const enabled = entries.filter((e) => e.enabled)
  if (enabled.length === 0) {
    throw new Error('No enabled subscriptions')
  }

  const results = await Promise.all(
    enabled.map(async (entry) => {
      const { proxies, error } = await fetcher.fetchEntry(entry)
      return { entry: { id: entry.id, name: entry.name }, proxies, error }
    }),
  )

  const aggregated = aggregateProxies(results, opts)
  return {
    ...aggregated,
    yaml: buildClashYaml(aggregated.proxies),
    builtAt: Date.now(),
  }
}
