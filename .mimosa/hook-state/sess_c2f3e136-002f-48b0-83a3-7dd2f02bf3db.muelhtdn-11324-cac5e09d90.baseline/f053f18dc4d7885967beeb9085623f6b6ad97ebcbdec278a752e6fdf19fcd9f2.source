import type { Subscription } from '@slave-vpn/shared'
import { API } from '@slave-vpn/shared'
import type { CacheManager } from '../cache/CacheManager'

const CACHE_KEY = 'subscription:current'
const ENTITY_TYPE = 'subscription'

export class SubscriptionRepository {
  constructor(private readonly cache: CacheManager) {}

  get(): Subscription | null {
    return this.cache.get<Subscription>(CACHE_KEY)
  }

  set(subscription: Subscription): void {
    this.cache.set(CACHE_KEY, subscription, {
      ttlMs: API.CACHE_TTL_MS.SUBSCRIPTION,
      entityType: ENTITY_TYPE,
    })
  }

  invalidate(): void {
    this.cache.delete(CACHE_KEY)
  }

  isStale(): boolean {
    return !this.cache.isValid(CACHE_KEY, API.CACHE_TTL_MS.SUBSCRIPTION)
  }
}
