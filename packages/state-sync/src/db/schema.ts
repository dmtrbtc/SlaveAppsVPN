export const SCHEMA_VERSION = 1

export const CREATE_SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL,
    applied_at  INTEGER NOT NULL DEFAULT (unixepoch())
  )
`

export const CREATE_CACHE_ENTRIES_TABLE = `
  CREATE TABLE IF NOT EXISTS cache_entries (
    key         TEXT    NOT NULL PRIMARY KEY,
    value       TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    cached_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at  INTEGER NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1
  )
`

export const CREATE_SYNC_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT    NOT NULL,
    payload     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
  )
`

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cache_entries_entity_type ON cache_entries(entity_type)`,
]

export const ALL_DDL = [
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_CACHE_ENTRIES_TABLE,
  CREATE_SYNC_QUEUE_TABLE,
  ...CREATE_INDEXES,
]
