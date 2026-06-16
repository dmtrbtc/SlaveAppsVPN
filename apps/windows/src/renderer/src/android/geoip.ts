// IP-based country geolocation for the server list (Android). The country was
// previously guessed from the node NAME; this resolves the real country from the
// server's IP/host via a free geoip API (ipwho.is — accepts an IP or a domain,
// returns country_code + flag emoji, sends CORS headers so it also works on the
// Windows renderer in dev). Results are cached in localStorage (7 days) so the
// network lookup is a one-time cost per host. Name-based detection stays as the
// fallback when the API is unreachable (caller handles that).

import { CapacitorHttp, Capacitor } from '@capacitor/core'

export interface GeoCountry { code: string; name: string; flag: string }
interface GeoEntry extends GeoCountry { at: number }

const LS_KEY = 'slave.geoip.v1'
const TTL_MS = 7 * 24 * 3600_000 // 7 days
const mem = new Map<string, GeoEntry>()

function loadCache(): Record<string, GeoEntry> {
  try { return JSON.parse(window.localStorage.getItem(LS_KEY) ?? '{}') as Record<string, GeoEntry> } catch { return {} }
}
function saveEntry(host: string, e: GeoEntry): void {
  try {
    const all = loadCache()
    all[host] = e
    window.localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
  mem.set(host, e)
}
function getCached(host: string): GeoEntry | null {
  const m = mem.get(host)
  if (m && Date.now() - m.at < TTL_MS) return m
  const e = loadCache()[host]
  if (e && Date.now() - e.at < TTL_MS) { mem.set(host, e); return e }
  return null
}

// Drop a trailing :port and surrounding whitespace; leave IPv4/IPv6/hostname.
function normalizeHost(server: string): string {
  return server.replace(/:\d+$/, '').trim()
}

async function fetchGeo(host: string): Promise<GeoEntry | null> {
  const url = `https://ipwho.is/${encodeURIComponent(host)}?fields=success,country,country_code,flag`
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 3000))
  const req = (async (): Promise<GeoEntry | null> => {
    try {
      let payload: unknown
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({ url })
        payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
      } else {
        const res = await fetch(url)
        payload = await res.json()
      }
      const d = payload as { success?: boolean; country?: string; country_code?: string; flag?: { emoji?: string } }
      if (!d || d.success === false || !d.country_code) return null
      return {
        code: String(d.country_code).toUpperCase(),
        name: String(d.country ?? ''),
        flag: String(d.flag?.emoji ?? ''),
        at: Date.now(),
      }
    } catch { return null }
  })()
  return Promise.race([req, timeout])
}

/** Resolve a server host/IP → country (cached). null when unknown/unreachable. */
export async function lookupCountry(server: string): Promise<GeoCountry | null> {
  const host = normalizeHost(server)
  if (!host) return null
  const cached = getCached(host)
  if (cached) return { code: cached.code, name: cached.name, flag: cached.flag }
  const e = await fetchGeo(host)
  if (e) { saveEntry(host, e); return { code: e.code, name: e.name, flag: e.flag } }
  return null
}
