import { CapacitorHttp, Capacitor } from '@capacitor/core'

/**
 * Lightweight in-app update check for the Android build — "notify + by button".
 *
 * Polls the GitHub Releases API (including prereleases/alphas) and decides a
 * newer build exists by comparing the release `published_at` against this APK's
 * build timestamp (__BUILD_TIMESTAMP__), with a buffer so a build never flags its
 * OWN release as an update. No auto-download: we only surface the banner; the
 * user taps to open the APK. Uses CapacitorHttp on device (no CORS, no UA loss).
 */

const RELEASES_API = 'https://api.github.com/repos/dmtrbtc/SlaveAppsVPN/releases?per_page=5'
// A release published more than this after our build is treated as "newer"
// (avoids flagging the build's own release, which publishes minutes later).
const NEWER_BUFFER_MS = 60 * 60 * 1000 // 1 hour

export interface UpdateInfo {
  version: string          // release tag, e.g. v0.2.0-alpha.2
  notes: string
  releaseUrl: string       // html page
  downloadUrl: string | null  // platform asset (.apk on Android, Setup .exe on Windows)
  publishedAt: number
}

interface GhAsset { name: string; browser_download_url: string }
interface GhRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: GhAsset[]
}

/**
 * Update channel. 'stable' = only final releases; 'beta' = the "Dev" channel,
 * which also surfaces prereleases (alpha/beta/rc/dev tags, marked
 * `prerelease: true` on GitHub). The stored value stays 'beta' for backward
 * compatibility; the UI labels it "Dev".
 */
export type UpdateChannel = 'stable' | 'beta'

function buildTimestampMs(): number {
  try {
    const t = new Date(__BUILD_TIMESTAMP__).getTime()
    return Number.isFinite(t) ? t : 0
  } catch { return 0 }
}

// ─── semver compare (handles -dev.N/-rc.N prereleases) ─────────────────────────
interface ParsedVer { rel: [number, number, number]; pre: Array<string | number> }

function parseVer(v: string): ParsedVer | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v.trim())
  if (!m) return null
  const pre = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : []
  return { rel: [Number(m[1]), Number(m[2]), Number(m[3])], pre }
}

/** -1 / 0 / +1 for a<b / a==b / a>b. A release (no prerelease) outranks a prerelease of the same x.y.z. */
function cmpVer(a: string, b: string): number {
  const pa = parseVer(a)
  const pb = parseVer(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa.rel[i]! !== pb.rel[i]!) return pa.rel[i]! < pb.rel[i]! ? -1 : 1
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1 // a is a release, b a prerelease
  if (pb.pre.length === 0) return -1
  const n = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    return String(x) < String(y) ? -1 : 1
  }
  return 0
}

/** The version baked into this build (from package.json via the Vite define). */
export function getCurrentVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
}

/**
 * Release notes for the CURRENTLY INSTALLED version — powers the post-update
 * «Что нового» card. Finds the GitHub release whose tag matches this build's
 * version exactly (x.y.z, ignoring the `v` prefix; a -dev/-rc prerelease of the
 * same x.y.z does NOT match, so a stable build shows the stable notes). Returns
 * null when offline, no match, or the release has an empty body. Never throws.
 */
export async function getInstalledVersionNotes(): Promise<{ version: string; notes: string; releaseUrl: string } | null> {
  try {
    const installed = getCurrentVersion()
    if (!parseVer(installed)) return null
    const match = (await fetchReleases())
      .filter(r => !r.draft)
      .find(r => parseVer(r.tag_name) !== null && cmpVer(r.tag_name, installed) === 0)
    if (!match || !match.body || !match.body.trim()) return null
    return { version: match.tag_name || installed, notes: match.body, releaseUrl: match.html_url }
  } catch {
    return null
  }
}

async function fetchReleases(): Promise<GhRelease[]> {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'SlaveVPN-update' }
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: RELEASES_API, headers, readTimeout: 15000, connectTimeout: 15000 } as Parameters<typeof CapacitorHttp.get>[0])
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    return Array.isArray(data) ? data as GhRelease[] : []
  }
  // Electron (Windows): the renderer CSP is `connect-src 'none'`, so a direct
  // fetch to api.github.com is blocked. Proxy the request through the main
  // process, which is not bound by the renderer CSP.
  const bridge = (window as unknown as { slaveVPN?: { update?: { fetchReleases?: () => Promise<unknown[]> } } }).slaveVPN
  if (bridge?.update?.fetchReleases) {
    const data = await bridge.update.fetchReleases()
    return Array.isArray(data) ? data as GhRelease[] : []
  }
  // Dev fallback (no preload bridge, e.g. plain browser): try a direct fetch.
  const res = await fetch(RELEASES_API, { headers })
  return res.ok ? (await res.json()) as GhRelease[] : []
}

/**
 * Returns the newest release in the chosen channel if it's newer than this
 * build, else null. Never throws.
 *
 * Channel filtering: 'stable' considers only final releases (`prerelease:false`);
 * 'beta' (the "Dev" channel) also considers prereleases. A stable user therefore
 * never sees a -dev/-rc build; a Dev user gets whichever is newest.
 */
export async function checkForUpdate(channel: UpdateChannel = 'stable'): Promise<UpdateInfo | null> {
  try {
    const releases = (await fetchReleases())
      .filter(r => !r.draft)
      .filter(r => channel === 'beta' || !r.prerelease)
    if (releases.length === 0) return null
    // API returns newest first; after channel filtering [0] is the newest
    // release this channel is allowed to offer.
    const latest = releases[0]!
    const publishedAt = new Date(latest.published_at).getTime()
    if (!Number.isFinite(publishedAt)) return null

    // Primary: compare the release TAG to the installed version (semver). Reliable
    // across rapid dev builds, where the published_at+1h heuristic below wrongly
    // suppressed a release cut <1h after the running build (two dev tags an hour
    // apart never surfaced). Fall back to the timestamp buffer only when a version
    // can't be parsed (e.g. an oddly-named tag).
    const installed = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
    if (parseVer(latest.tag_name) && parseVer(installed)) {
      if (cmpVer(latest.tag_name, installed) <= 0) return null // not newer than what's installed
    } else {
      const built = buildTimestampMs()
      if (built > 0 && publishedAt <= built + NEWER_BUFFER_MS) return null // we're current
    }

    // Pick the asset for THIS platform: .apk on Android, the Windows installer
    // (Setup .exe) on desktop.
    const native = Capacitor.isNativePlatform()
    const asset = native
      ? latest.assets.find(a => a.name.toLowerCase().endsWith('.apk'))
      : (latest.assets.find(a => /setup.*\.exe$/i.test(a.name)) ?? latest.assets.find(a => a.name.toLowerCase().endsWith('.exe')))
    return {
      version: latest.tag_name || latest.name || 'новая версия',
      notes: latest.body ?? '',
      releaseUrl: latest.html_url,
      downloadUrl: asset?.browser_download_url ?? null,
      publishedAt,
    }
  } catch {
    return null
  }
}

/**
 * Open the APK (or release page) so the user can download + install it.
 *
 * Android: Capacitor routes external http(s) URLs opened with target=_blank to
 * the system browser, which downloads the APK; the user then taps to install.
 *
 * Windows (Electron): `window.open` is DENIED by setWindowOpenHandler, so the
 * button did nothing. Route through the main process (`shell.openExternal`) via
 * the preload bridge so the Setup .exe download opens in the system browser.
 */
export function openUpdate(info: UpdateInfo): void {
  const url = info.downloadUrl ?? info.releaseUrl
  if (!Capacitor.isNativePlatform()) {
    const bridge = (window as unknown as { slaveVPN?: { update?: { openExternal?: (u: string) => unknown } } }).slaveVPN
    if (bridge?.update?.openExternal) {
      try { void bridge.update.openExternal(url); return } catch { /* fall through */ }
    }
  }
  try { window.open(url, '_blank') } catch { /* ignore */ }
}
