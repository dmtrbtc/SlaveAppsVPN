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
  published_at: string
  assets: GhAsset[]
}

function buildTimestampMs(): number {
  try {
    const t = new Date(__BUILD_TIMESTAMP__).getTime()
    return Number.isFinite(t) ? t : 0
  } catch { return 0 }
}

async function fetchReleases(): Promise<GhRelease[]> {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'SlaveVPN-update' }
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: RELEASES_API, headers, readTimeout: 15000, connectTimeout: 15000 } as Parameters<typeof CapacitorHttp.get>[0])
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    return Array.isArray(data) ? data as GhRelease[] : []
  }
  const res = await fetch(RELEASES_API, { headers })
  return res.ok ? (await res.json()) as GhRelease[] : []
}

/**
 * Returns the newest release if it's newer than this build, else null.
 * Never throws.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const releases = (await fetchReleases()).filter(r => !r.draft)
    if (releases.length === 0) return null
    // API returns newest first.
    const latest = releases[0]!
    const publishedAt = new Date(latest.published_at).getTime()
    const built = buildTimestampMs()
    if (!Number.isFinite(publishedAt)) return null
    if (built > 0 && publishedAt <= built + NEWER_BUFFER_MS) return null // we're current

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
 * Capacitor routes external http(s) URLs opened with target=_blank to the
 * system browser, which downloads the APK; the user then taps to install.
 */
export function openUpdate(info: UpdateInfo): void {
  const url = info.downloadUrl ?? info.releaseUrl
  try { window.open(url, '_blank') } catch { /* ignore */ }
}
