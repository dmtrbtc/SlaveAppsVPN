import {
  aggregateSubscriptionProxies,
  aggregateSubscriptions,
  createSubscriptionFetcher,
} from '@slave-vpn/core'
import {
  listSubscriptions,
  getSubscriptionInput,
  updateSubscriptionMeta,
} from '../subscription-store'
import { fetchSubscriptionText, fetchSubscriptionTextUA } from '../native-fetch'

// Only platform data access lives here. Parsing/recovery/metadata orchestration
// and deduplication live in core; persisted keys and native HWID headers stay put.
const fetcher = createSubscriptionFetcher({
  getInput: getSubscriptionInput,
  updateMeta: async (id, patch) => { await updateSubscriptionMeta(id, patch) },
  fetchText: fetchSubscriptionText,
  fetchTextWithUserAgent: fetchSubscriptionTextUA,
})

async function loadEntries() {
  const entries = await listSubscriptions()
  if (!entries.some(e => e.enabled)) {
    throw new Error('Add a subscription first (Подписки)')
  }
  return entries
}

// Keep Android's sequential requests (including metadata writes) and ordering.
export async function buildAggregatedProxies() {
  return aggregateSubscriptionProxies(await loadEntries(), fetcher, { concurrency: 1 })
}

export async function buildAggregatedYaml() {
  const result = await aggregateSubscriptions(await loadEntries(), fetcher, { concurrency: 1 })
  return { yaml: result.yaml, totalProxies: result.proxies.length, warnings: result.warnings }
}
