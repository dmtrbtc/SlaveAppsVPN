import { parseGeoSiteCategories } from '@slave-vpn/core'
import type { NetworkAdapter, StorageAdapter } from '@slave-vpn/core'

/**
 * Provides the geosite categories that the Android native engine actually has,
 * so the config generator can drop GEOSITE rules for categories absent from the
 * loaded dat (mihomo fatals on an unknown category — same problem solved on
 * Windows by reading geosite.dat directly).
 *
 * The native mihomo auto-downloads the MetaCubeX geosite.dat (geox-url =
 * META_GEOX_URL). The renderer can't read that native file, so it fetches the
 * SAME dat itself (binary, via the NetworkAdapter's CapacitorHttp — no CORS),
 * scans the category names with the shared core parser, and caches the result so
 * the ~4 MB download happens at most weekly, not on every connect.
 *
 * Caching keeps a stale list as a fallback if a refresh fails; on a total miss
 * it returns [] (the generator then applies NO geosite filter — acceptable only
 * because the warm-up below normally populates the cache before first connect).
 */

const GEOSITE_URL =
  'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat'
const CACHE_KEY = 'slave.android.geositeCats.v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // a week — categories rarely change
const MIN_CATS = 100 // sanity floor: real MetaCubeX geosite has ~1500 categories

interface Cached {
  at: number
  cats: string[]
}

async function fetchAndParse(network: NetworkAdapter): Promise<string[]> {
  const res = await network.fetchBytes(GEOSITE_URL, { timeoutMs: 40_000 })
  if (res.status < 200 || res.status >= 300) return []
  return [...parseGeoSiteCategories(res.bytes)]
}

export async function getAndroidGeoSiteCategories(
  network: NetworkAdapter,
  storage: StorageAdapter,
): Promise<string[]> {
  let cached: Cached | null = null
  try {
    cached = await storage.get<Cached>(CACHE_KEY)
  } catch {
    cached = null
  }

  // Fresh cache wins — avoids re-downloading 4 MB on every connect.
  if (cached && cached.cats.length >= MIN_CATS && Date.now() - cached.at < TTL_MS) {
    return cached.cats
  }

  // Stale/missing — try to refresh, keeping any stale list as fallback.
  try {
    const fresh = await fetchAndParse(network)
    if (fresh.length >= MIN_CATS) {
      await storage.set<Cached>(CACHE_KEY, { at: Date.now(), cats: fresh }).catch(() => undefined)
      return fresh
    }
  } catch {
    /* fall back to stale below */
  }
  return cached?.cats ?? []
}

/** Fire-and-forget warm-up so the first connect already has the list cached. */
export function prefetchAndroidGeoSiteCategories(
  network: NetworkAdapter,
  storage: StorageAdapter,
): void {
  void getAndroidGeoSiteCategories(network, storage).catch(() => undefined)
}
