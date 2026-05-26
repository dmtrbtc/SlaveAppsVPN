import type BetterSqlite3 from 'better-sqlite3'
import { isCacheValid } from '@slave-vpn/shared'

interface CacheRow {
  key: string
  value: string
  entity_type: string
  cached_at: number
  expires_at: number
  version: number
}

export class CacheManager {
  constructor(private readonly db: BetterSqlite3.Database) {}

  get<T>(key: string): T | null {
    const nowSec = Math.floor(Date.now() / 1000)

    const row = this.db
      .prepare<[string, number], CacheRow>(
        'SELECT * FROM cache_entries WHERE key = ? AND expires_at > ?'
      )
      .get(key, nowSec)

    if (!row) return null

    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T, options: { ttlMs: number; entityType: string }): void {
    const { ttlMs, entityType } = options
    const nowSec = Math.floor(Date.now() / 1000)
    const expiresAtSec = Math.floor((Date.now() + ttlMs) / 1000)
    const serialized = JSON.stringify(value)

    this.db
      .prepare(
        `INSERT INTO cache_entries (key, value, entity_type, cached_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value      = excluded.value,
           cached_at  = excluded.cached_at,
           expires_at = excluded.expires_at`
      )
      .run(key, serialized, entityType, nowSec, expiresAtSec)
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM cache_entries WHERE key = ?').run(key)
  }

  deleteByEntityType(entityType: string): void {
    this.db.prepare('DELETE FROM cache_entries WHERE entity_type = ?').run(entityType)
  }

  purgeExpired(): number {
    const nowSec = Math.floor(Date.now() / 1000)
    const result = this.db
      .prepare<[number]>('DELETE FROM cache_entries WHERE expires_at <= ?')
      .run(nowSec)
    return result.changes
  }

  isValid(key: string, ttlMs: number): boolean {
    const row = this.db
      .prepare<[string], Pick<CacheRow, 'cached_at'>>('SELECT cached_at FROM cache_entries WHERE key = ?')
      .get(key)

    if (!row) return false
    return isCacheValid(row.cached_at * 1000, ttlMs)
  }

  clear(): void {
    this.db.prepare('DELETE FROM cache_entries').run()
  }
}
