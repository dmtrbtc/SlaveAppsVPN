/**
 * Parse the category (country_code) names out of a v2ray/mihomo `geosite.dat`
 * buffer. Platform-agnostic (Uint8Array + TextDecoder, no Node Buffer/fs), so it
 * runs in the Windows main process AND the Android WebView.
 *
 * geosite.dat is a protobuf `GeoSiteList { repeated GeoSite entry = 1 }` where
 * each `GeoSite { string country_code = 1; repeated Domain domain = 2 }`. We only
 * need the category names: every entry is a length-delimited field #1, and the
 * first field inside each entry is the (length-delimited) name. We skip straight
 * to the next entry without decoding the (large) domain lists. Names are stored
 * upper-case but mihomo matches case-insensitively, so we lower-case them.
 *
 * Used to drop `GEOSITE,<cat>,...` rules for categories absent from the loaded
 * dat (mihomo fatals on an unknown category) — unified across platforms.
 */
export function parseGeoSiteCategories(buf: Uint8Array): Set<string> {
  const out = new Set<string>()
  const decoder = new TextDecoder('utf-8')

  const readVarint = (offset: number): [value: number, next: number] => {
    let result = 0
    let shift = 0
    let p = offset
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
      // top-level: field #1, wire type 2 (LEN) == 0x0a
      if (buf[o] !== 0x0a) break
      o++
      let entryLen: number
      ;[entryLen, o] = readVarint(o)
      const bodyStart = o
      const end = bodyStart + entryLen
      if (end > buf.length) break
      // first field inside GeoSite: country_code, field #1 LEN == 0x0a
      if (buf[bodyStart] === 0x0a) {
        let nameLen: number
        let p = bodyStart + 1
        ;[nameLen, p] = readVarint(p)
        if (p + nameLen <= buf.length) {
          out.add(decoder.decode(buf.subarray(p, p + nameLen)).toLowerCase())
        }
      }
      o = end
    }
  } catch {
    // partial parse — return whatever we collected
  }
  return out
}
