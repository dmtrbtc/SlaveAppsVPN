import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  // v1 → baseline schema (applied on first run via schema.ts DDL)
  // Add future migrations here:
  // {
  //   version: 2,
  //   description: 'Add servers table',
  //   up: (db) => {
  //     db.exec(`CREATE TABLE IF NOT EXISTS servers (...)`)
  //   }
  // }
]

export function runMigrations(db: Database.Database, currentVersion: number): number {
  const pending = migrations.filter((m) => m.version > currentVersion)

  if (pending.length === 0) return currentVersion

  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
    })
    tx()
  }

  const latest = pending.at(-1)?.version ?? currentVersion
  return latest
}
