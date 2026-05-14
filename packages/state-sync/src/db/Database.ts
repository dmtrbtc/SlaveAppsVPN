import BetterSqlite3 from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { ALL_DDL, SCHEMA_VERSION } from './schema'
import { runMigrations } from './migrations'

export type { Database as SqliteDatabase } from 'better-sqlite3'

let _db: BetterSqlite3.Database | null = null

export function openDatabase(userDataPath: string): BetterSqlite3.Database {
  if (_db) return _db

  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'slavevpn.db')

  const db = new BetterSqlite3(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  })

  // Performance pragmas (safe for our use case)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('cache_size = -8000')  // 8MB page cache

  applyBaseSchema(db)
  applyMigrations(db)

  _db = db
  return db
}

export function getDatabase(): BetterSqlite3.Database {
  if (!_db) throw new Error('Database not initialized. Call openDatabase() first.')
  return _db
}

export function closeDatabase(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

function applyBaseSchema(db: BetterSqlite3.Database): void {
  const tx = db.transaction(() => {
    for (const ddl of ALL_DDL) {
      db.exec(ddl)
    }
    const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as
      | { version: number }
      | undefined

    if (!row) {
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    }
  })
  tx()
}

function applyMigrations(db: BetterSqlite3.Database): void {
  const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined

  const currentVersion = row?.version ?? 0
  runMigrations(db, currentVersion)
}
