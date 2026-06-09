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
 * Returns an empty set on any error — callers must treat "empty" as "unknown,
 * do not filter" so a read failure never silently strips every geosite rule.
 */
export function readGeoSiteCategories(datPath: string): Set<string> {
  const out = new Set<string>()
  let buf: Buffer
  try {
    buf = fs.readFileSync(datPath)
  } catch {
    return out
  }

  const readVarint = (offset: number): [value: number, next: number] => {
    let result = 0
    let shift = 0
    let p = offset
    // Cap shift to keep within safe-integer range; geosite lengths fit in 32 bits.
    while (p < buf.length) {
      const byte = buf[p++]!
      result |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
      if (shift > 35) break // malformed
    }
    return [result >>> 0, p]
  }

  let o = 0
  try {
    while (o < buf.length) {
      // top-level: tag for field #1, wire type 2 (LEN) == 0x0a
      if (buf[o] !== 0x0a) break
      o++
      let entryLen: number
      ;[entryLen, o] = readVarint(o)
      const entryEnd = o + entryLen
      if (entryEnd > buf.length) break
      // first field inside GeoSite: country_code, field #1 LEN == 0x0a
      if (buf[o] === 0x0a) {
        let nameLen: number
        let p = o + 1
        ;[nameLen, p] = readVarint(p)
        if (p + nameLen <= buf.length) {
          out.add(buf.slice(p, p + nameLen).toString('utf8').toLowerCase())
        }
      }
      o = entryEnd
    }
  } catch {
    // Partial parse — return whatever we collected (better than nothing).
  }
  return out
}
