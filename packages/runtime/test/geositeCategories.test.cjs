const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const {
  isGeoSiteDatValid,
  readGeoSiteCategories,
  mergeGeoSiteDat,
} = require('../dist/mihomo/geositeCategories.js')

function varint(value) {
  const bytes = []
  let rest = value >>> 0
  do {
    let byte = rest & 0x7f
    rest >>>= 7
    if (rest > 0) byte |= 0x80
    bytes.push(byte)
  } while (rest > 0)
  return Buffer.from(bytes)
}

function record(category, marker) {
  const name = Buffer.from(category, 'utf8')
  const domain = Buffer.from(marker, 'utf8')
  const body = Buffer.concat([
    Buffer.from([0x0a]), varint(name.length), name,
    Buffer.from([0x12]), varint(domain.length), domain,
  ])
  return Buffer.concat([Buffer.from([0x0a]), varint(body.length), body])
}

function dat(...records) {
  return Buffer.concat(records)
}

test('readGeoSiteCategories enumerates categories case-insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slave-geosite-'))
  const file = join(dir, 'geosite.dat')
  try {
    writeFileSync(file, dat(record('RU', 'base'), record('RU-BLOCKED', 'extra')))
    assert.deepEqual([...readGeoSiteCategories(file)], ['ru', 'ru-blocked'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('merge appends missing categories and keeps the base copy of duplicates', () => {
  const base = dat(record('RU', 'base-version'), record('CATEGORY-ADS-ALL', 'base-ads'))
  const extra = dat(
    record('CATEGORY-ADS-ALL', 'extra-ads-must-not-win'),
    record('RU-BLOCKED', 'blocked-domains'),
  )

  const merged = mergeGeoSiteDat(base, [extra])
  assert.ok(merged.subarray(0, base.length).equals(base), 'base records remain byte-identical')
  assert.equal(merged.indexOf(Buffer.from('extra-ads-must-not-win')), -1)
  assert.notEqual(merged.indexOf(Buffer.from('blocked-domains')), -1)
})

test('merge deduplicates categories across multiple extras', () => {
  const base = dat(record('RU', 'base'))
  const first = dat(record('RU-BLOCKED', 'first-wins'))
  const second = dat(record('RU-BLOCKED', 'second-loses'), record('YOUTUBE', 'youtube'))

  const merged = mergeGeoSiteDat(base, [first, second])
  assert.notEqual(merged.indexOf(Buffer.from('first-wins')), -1)
  assert.equal(merged.indexOf(Buffer.from('second-loses')), -1)
  assert.notEqual(merged.indexOf(Buffer.from('youtube')), -1)
})

test('merge leaves the base unchanged when base or extra protobuf is truncated', () => {
  const base = dat(record('RU', 'base'))
  const truncatedBase = base.subarray(0, base.length - 1)
  assert.strictEqual(mergeGeoSiteDat(truncatedBase, [dat(record('RU-BLOCKED', 'blocked'))]), truncatedBase)

  const validPrefix = record('RU-BLOCKED', 'must-not-merge-partial-file')
  const truncatedExtra = Buffer.concat([validPrefix, Buffer.from([0x0a, 0x7f, 0x01])])
  assert.strictEqual(mergeGeoSiteDat(base, [truncatedExtra]), base)

  const truncatedVarint = Buffer.from([0x0a, 0x80])
  assert.strictEqual(mergeGeoSiteDat(truncatedVarint, [dat(record('RU-BLOCKED', 'blocked'))]), truncatedVarint)
  assert.equal(isGeoSiteDatValid(truncatedVarint), false)

  const overflowVarint = Buffer.from([0x0a, 0xff, 0xff, 0xff, 0xff, 0x10])
  assert.equal(isGeoSiteDatValid(overflowVarint), false)
})
