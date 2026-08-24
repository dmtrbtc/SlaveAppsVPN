import fs from 'fs'

/**
 * Reads the list of category names present in a v2ray/mihomo `geosite.dat`.
 *
 * WHY: mihomo FATALS at config parse if a `GEOSITE,<cat>,...` rule references a
 * category that is absent from the loaded geosite.dat (e.g. a RuNet-specific
 * category like `ru-blocked` that only lives in geosite-runetfreedom.dat, or a
 * category that simply isn't in the MetaCubeX build). To stay resilient we read
 * the available categories and let the config generator drop rules for missing
 * ones instead of letting the whole engine crash-loop.
 *
 * geosite.dat is a protobuf `GeoSiteList { repeated GeoSite entry = 1 }` where
 * each `GeoSite { string country_code = 1; repeated Domain domain = 2 }`. We do
 * a minimal top-level scan: every entry is a length-delimited field #1, and the
 * first field inside each entry is the (length-delimited) category name. We only
 * need those names, so there's no need to decode the (large) domain lists — we
 * skip straight to the next entry. Names are stored upper-case in the dat but
 * mihomo matches case-insensitively, so we lower-case them here.
 *
 * Returns an empty set when the file cannot be read or parsed completely.
 * Callers treat "empty" as "unknown, do not filter", so a truncated file never
 * silently strips every category after its last verified record.
 */
export function readGeoSiteCategories(datPath: string): Set<string> {
  let buf: Buffer
  try {
    buf = fs.readFileSync(datPath)
  } catch {
    return new Set<string>()
  }
  const parsed = parseGeoSiteRecords(buf)
  if (!parsed.complete) return new Set<string>()
  const out = new Set<string>()
  for (const r of parsed.records) {
    if (r.category) out.add(r.category)
  }
  return out
}

function readVarint(buf: Buffer, offset: number): [value: number, next: number] {
  let result = 0
  let shift = 0
  let p = offset
  // geosite lengths fit in uint32 (at most five protobuf varint bytes).
  while (p < buf.length) {
    const byte = buf[p++]!
    if (shift === 28 && (byte & 0xf0) !== 0) {
      throw new Error('Protobuf varint exceeds uint32')
    }
    result += (byte & 0x7f) * (2 ** shift)
    if ((byte & 0x80) === 0) return [result >>> 0, p]
    shift += 7
    if (shift > 28) throw new Error('Malformed protobuf varint')
  }
  throw new Error('Truncated protobuf varint')
}

interface GeoSiteRecord {
  /** lower-cased country_code / category name, or '' when unreadable */
  category: string
  /** byte offset of the record's leading field-#1 tag (0x0a) */
  start: number
  /** byte offset just past the record body */
  end: number
}

interface GeoSiteParseResult {
  records: GeoSiteRecord[]
  complete: boolean
}

/** True only when the full buffer is a non-empty, structurally valid GeoSiteList. */
export function isGeoSiteDatValid(buf: Buffer): boolean {
  const parsed = parseGeoSiteRecords(buf)
  return parsed.complete && parsed.records.length > 0 && parsed.records.every((record) => record.category.length > 0)
}

// Walk the top-level `GeoSiteList { repeated GeoSite entry = 1 }` records. Each
// record is `0x0a <varint len> <body>`; the first field inside the body is the
// (length-delimited) country_code/category. We return the raw byte span of every
// verified record plus its category and whether the complete input was parsed,
// so callers can enumerate a valid prefix but refuse to merge a partial file.
function parseGeoSiteRecords(buf: Buffer): GeoSiteParseResult {
  const records: GeoSiteRecord[] = []
  let o = 0
  try {
    while (o < buf.length) {
      const start = o
      // top-level: tag for field #1, wire type 2 (LEN) == 0x0a
      if (buf[o] !== 0x0a) return { records, complete: false }
      o++
      let entryLen: number
      ;[entryLen, o] = readVarint(buf, o)
      const bodyStart = o
      const end = bodyStart + entryLen
      if (end > buf.length) return { records, complete: false }
      let category = ''
      // first field inside GeoSite: country_code, field #1 LEN == 0x0a
      if (buf[bodyStart] === 0x0a) {
        let nameLen: number
        let p = bodyStart + 1
        ;[nameLen, p] = readVarint(buf, p)
        if (p + nameLen <= end) {
          category = buf.slice(p, p + nameLen).toString('utf8').toLowerCase()
        }
      }
      records.push({ category, start, end })
      o = end
    }
  } catch {
    return { records, complete: false }
  }
  return { records, complete: o === buf.length }
}

/**
 * Merge extra `geosite.dat` files into a base one, returning the combined buffer.
 *
 * WHY: mihomo loads a SINGLE geosite.dat from its working dir, but some
 * categories (e.g. `ru-blocked`) only ship in a separate RuNet dat. A
 * `GeoSiteList` is just `repeated GeoSite entry = 1`, so appending another
 * GeoSiteList's serialized records yields a valid merged GeoSiteList — no
 * re-encoding needed. We splice each extra record verbatim, skipping any
 * category already present in the base (first-wins → the canonical MetaCubeX
 * entry beats a RuNet duplicate of e.g. `category-ads-all`).
 *
 * Returns the base buffer unchanged when nothing is appended, when the base is
 * unparseable, or when the base has a trailing region we didn't recognise (so a
 * malformed input can never get corrupted by a blind concat).
 */
export function mergeGeoSiteDat(baseBuf: Buffer, extraBufs: readonly Buffer[]): Buffer {
  const baseParsed = parseGeoSiteRecords(baseBuf)
  const baseRecords = baseParsed.records
  if (baseRecords.length === 0) return baseBuf
  // Only append if we fully accounted for the base bytes — otherwise a tail we
  // misread would land between the base garbage and the appended records.
  if (!baseParsed.complete || baseRecords[baseRecords.length - 1]!.end !== baseBuf.length) return baseBuf

  const known = new Set(baseRecords.map((r) => r.category).filter(Boolean))
  const appended: Buffer[] = []
  for (const extra of extraBufs) {
    const parsed = parseGeoSiteRecords(extra)
    // Never merge a valid prefix from a truncated/corrupt download: doing so
    // would make the output look valid while silently omitting later records.
    if (!parsed.complete) continue
    for (const r of parsed.records) {
      if (!r.category || known.has(r.category)) continue
      known.add(r.category)
      appended.push(extra.subarray(r.start, r.end))
    }
  }
  if (appended.length === 0) return baseBuf
  return Buffer.concat([baseBuf, ...appended])
}
