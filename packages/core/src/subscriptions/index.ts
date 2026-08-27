export type {
  ParsedProxy,
  SubscriptionSourceType,
  SubscriptionAutoUpdate,
  SubscriptionEntry,
  FetchedEntry,
  SubscriptionFetcher,
  AggregationResult,
} from './types.js'
export { aggregateProxies } from './aggregateProxies.js'
export {
  aggregateSubscriptions,
  aggregateSubscriptionProxies,
  type AggregateSubscriptionsOptions,
  type AggregateSubscriptionsResult,
} from './aggregateSubscriptions.js'
export {
  createSubscriptionFetcher,
  type SubscriptionSourceAdapter,
  type SubscriptionFetchMeta,
} from './createSubscriptionFetcher.js'
