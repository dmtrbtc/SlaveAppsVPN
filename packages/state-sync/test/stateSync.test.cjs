const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

// The package is CommonJS-only; test against its built dist (script builds first).
const { openDatabase, closeDatabase, CacheManager, SubscriptionRepository, UserRepository, SCHEMA_VERSION } =
  require('../dist/index.js')

let dir
let db

beforeEach(() => {
  closeDatabase()
  dir = mkdtempSync(path.join(tmpdir(), 'slave-statesync-'))
  db = openDatabase(dir)
})

afterEach(() => {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
})

test('openDatabase creates the schema once and is a singleton', () => {
  const again = openDatabase(dir)
  assert.equal(again, db, 'second call returns the same handle')
  const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get()
  assert.equal(row.version, SCHEMA_VERSION)
  const count = db.prepare('SELECT COUNT(*) AS n FROM cache_entries').get()
  assert.equal(count.n, 0)
})

test('performance pragmas are applied (WAL journal)', () => {
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal')
})

test('CacheManager: JSON roundtrip with upsert semantics', () => {
  const cache = new CacheManager(db)
  cache.set('k', { a: 1 }, { ttlMs: 60_000, entityType: 't' })
  assert.deepEqual(cache.get('k'), { a: 1 })
  cache.set('k', { a: 2 }, { ttlMs: 60_000, entityType: 't' })
  assert.deepEqual(cache.get('k'), { a: 2 }, 'same key upserts, no duplicate rows')
  const rows = db.prepare('SELECT COUNT(*) AS n FROM cache_entries WHERE key = ?').get('k')
  assert.equal(rows.n, 1)
})

test('CacheManager: entries expire and get() hides them', async () => {
  const cache = new CacheManager(db)
  cache.set('gone', { x: true }, { ttlMs: 1, entityType: 't' })
  await new Promise(r => setTimeout(r, 25))
  assert.equal(cache.get('gone'), null, 'expired entry reads as missing')
  assert.equal(cache.purgeExpired(), 1, 'purge removes exactly the expired row')
  assert.equal(cache.purgeExpired(), 0)
})

test('CacheManager: delete, deleteByEntityType, clear', () => {
  const cache = new CacheManager(db)
  cache.set('a', 1, { ttlMs: 60_000, entityType: 'one' })
  cache.set('b', 2, { ttlMs: 60_000, entityType: 'one' })
  cache.set('c', 3, { ttlMs: 60_000, entityType: 'two' })
  cache.delete('a')
  assert.equal(cache.get('a'), null)
  cache.deleteByEntityType('one')
  assert.equal(cache.get('b'), null)
  assert.ok(cache.get('c') !== null, 'other entity types untouched')
  cache.clear()
  assert.equal(cache.get('c'), null)
})

test('CacheManager: corrupt JSON degrades to null instead of throwing', () => {
  const cache = new CacheManager(db)
  db.prepare(
    'INSERT INTO cache_entries (key, value, entity_type, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run('bad', '{not json', 't', 1, 9999999999)
  assert.equal(cache.get('bad'), null)
})

test('CacheManager: isValid reflects freshness against the requested TTL', () => {
  const cache = new CacheManager(db)
  cache.set('fresh', 1, { ttlMs: 60_000, entityType: 't' })
  assert.equal(cache.isValid('fresh', 60_000), true)
  assert.equal(cache.isValid('fresh', 1), false, 'staler than a 1ms TTL budget')
  assert.equal(cache.isValid('missing', 60_000), false)
})

test('SubscriptionRepository: set/get/invalidate and staleness by TTL', async () => {
  const repo = new SubscriptionRepository(new CacheManager(db))
  const sub = { id: 'sub-1', name: 'Test' }
  repo.set(sub)
  assert.deepEqual(repo.get(), sub)
  assert.equal(repo.isStale(), false)
  repo.invalidate()
  assert.equal(repo.get(), null)
  assert.equal(repo.isStale(), true, 'missing entry is stale')

  // A present-but-old entry: written past the repository's freshness budget
  // (5 min) while its own expiry is still in the future — readable but stale.
  const cache = new CacheManager(db)
  const nowSec = Math.floor(Date.now() / 1000)
  db.prepare(
    'INSERT INTO cache_entries (key, value, entity_type, cached_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run('subscription:current', JSON.stringify({ id: 'x' }), 'subscription', nowSec - 6 * 60, nowSec + 600)
  const repo2 = new SubscriptionRepository(cache)
  assert.equal(repo2.isStale(), true, 'older than the repository TTL budget → stale')
  assert.ok(repo2.get() !== null, 'but still readable until its own expiry')
})

test('UserRepository: set/get/invalidate and clearByEntityType', () => {
  const cache = new CacheManager(db)
  const users = new UserRepository(cache)
  const user = { id: 'u1', email: 'a@b.c' }
  users.set(user)
  assert.deepEqual(users.get(), user)
  users.invalidate()
  assert.equal(users.get(), null)
  users.set(user)
  users.clear()
  assert.equal(users.get(), null)
})
