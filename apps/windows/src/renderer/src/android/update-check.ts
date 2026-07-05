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

// ATOM feed (github.com), NOT api.github.com. The REST API is capped at 60
// req/hour PER IP; behind the shared VPN exit IP that's exhausted collectively →
// 403 → no update ever surfaces. The atom feed isn't rate-limited that way.
const RELEASES_ATOM = 'https://github.com/dmtrbtc/SlaveAppsVPN/releases.atom'
// Deterministic GitHub asset download base — the APK asset name is fixed by CI.
const RELEASE_DOWNLOAD_BASE = 'https://github.com/dmtrbtc/SlaveAppsVPN/releases/download'
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
    const inst = parseVer(getCurrentVersion())
    if (!inst) return null
    // Match by x.y.z (ignore any -dev/-rc suffix): __APP_VERSION__ is the bare
    // package version (e.g. "0.2.29"), while the release tag may be a prerelease
    // ("v0.2.29-dev.1") when no stable is cut yet. Among same-x.y.z releases prefer
    // the stable one; else the newest prerelease (API returns newest-first) — so a
    // -dev test build still finds its own notes.
    const sameXyz = (await fetchReleases())
      .filter(r => !r.draft)
      .filter(r => {
        const pv = parseVer(r.tag_name)
        return pv !== null && pv.rel[0] === inst.rel[0] && pv.rel[1] === inst.rel[1] && pv.rel[2] === inst.rel[2]
      })
    const match = sameXyz.find(r => parseVer(r.tag_name)?.pre.length === 0) ?? sameXyz[0]
    if (!match || !match.body || !match.body.trim()) return null
    return { version: match.tag_name || getCurrentVersion(), notes: match.body, releaseUrl: match.html_url }
  } catch {
    return null
  }
}

/**
 * Parse GitHub's releases.atom into GhRelease-shaped objects. The feed carries no
 * prerelease/draft flags or assets: `prerelease` is inferred from the tag suffix
 * (-dev/-rc/-alpha/-beta, matching our channel policy), `draft` is always false
 * (only published releases appear), and `assets` is empty (checkForUpdate derives
 * the per-platform download URL from the tag). Mirror of the Node parser in
 * update.handler.ts.
 */
export function parseAtomReleases(xml: string): GhRelease[] {
  const decode = (s: string): string =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  const out: GhRelease[] = []
  for (const entry of xml.split('<entry>').slice(1)) {
    const tag = /<title>([^<]+)<\/title>/.exec(entry)?.[1]?.trim()
    if (!tag) continue
    const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1]?.trim() ?? ''
    const href = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1] ?? ''
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? ''
    out.push({
      tag_name: tag,
      name: tag,
      body: decode(content).replace(/<[^>]+>/g, '').trim(),
      html_url: href || `https://github.com/dmtrbtc/SlaveAppsVPN/releases/tag/${tag}`,
      draft: false,
      prerelease: /-(?:dev|rc|alpha|beta)/i.test(tag),
      published_at: updated,
      assets: [],
    })
  }
  return out
}

async function fetchReleases(): Promise<GhRelease[]> {
  const headers = { 'User-Agent': 'SlaveVPN-update' }
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: RELEASES_ATOM, headers, readTimeout: 15000, connectTimeout: 15000 } as Parameters<typeof CapacitorHttp.get>[0])
    return parseAtomReleases(typeof res.data === 'string' ? res.data : String(res.data ?? ''))
  }
  // Electron (Windows): the renderer CSP is `connect-src 'none'`, so a direct
  // fetch is blocked. The main process fetches + parses the atom feed and returns
  // the ready array (it's not bound by the renderer CSP).
  const bridge = (window as unknown as { slaveVPN?: { update?: { fetchReleases?: () => Promise<unknown[]> } } }).slaveVPN
  if (bridge?.update?.fetchReleases) {
    const data = await bridge.update.fetchReleases()
    return Array.isArray(data) ? data as GhRelease[] : []
  }
  // Dev fallback (no preload bridge, e.g. plain browser): try a direct fetch.
  const res = await fetch(RELEASES_ATOM, { headers })
  return res.ok ? parseAtomReleases(await res.text()) : []
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

    // Asset names are FIXED by CI, so when the scan comes up empty — the atom feed
    // carries no assets at all, or the release is published while the asset is
    // still uploading — derive the deterministic GitHub download URL from the tag
    // (Android APK / Windows Setup) instead of dropping to the browser. Keeps
    // «Обновить» in-app; a not-yet-uploaded asset just 404s and the user retries.
    const tag = latest.tag_name
    const derivedUrl = tag
      ? native
        ? `${RELEASE_DOWNLOAD_BASE}/${tag}/SlaveAppsVPN-Android.apk`
        : `${RELEASE_DOWNLOAD_BASE}/${tag}/SlaveAppsVPN-Setup-${tag}.exe`
      : null

    return {
      version: latest.tag_name || latest.name || 'новая версия',
      notes: latest.body ?? '',
      releaseUrl: latest.html_url,
      downloadUrl: asset?.browser_download_url ?? derivedUrl,
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
