import type { User } from '@slave-vpn/shared'
import { API } from '@slave-vpn/shared'
import type { CacheManager } from '../cache/CacheManager'

const CACHE_KEY = 'user:current'
const ENTITY_TYPE = 'user'

export class UserRepository {
  constructor(private readonly cache: CacheManager) {}

  get(): User | null {
    return this.cache.get<User>(CACHE_KEY)
  }

  set(user: User): void {
    this.cache.set(CACHE_KEY, user, {
      ttlMs: API.CACHE_TTL_MS.USER_PROFILE,
      entityType: ENTITY_TYPE,
    })
  }

  invalidate(): void {
    this.cache.delete(CACHE_KEY)
  }

  clear(): void {
    this.cache.deleteByEntityType(ENTITY_TYPE)
  }
}
