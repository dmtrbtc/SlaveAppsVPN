import { CapacitorHttp, Capacitor } from '@capacitor/core'

/**
 * Fetch subscription content on Android.
 *
 * WHY THIS EXISTS: the WebView `fetch()` is subject to the browser's
 * same-origin / CORS policy. Virtually no VPN subscription server sends an
 * `Access-Control-Allow-Origin` header, so a plain `fetch()` from the WebView
 * is rejected before the body is ever read — which is exactly why "add
 * subscription" and "connect" both failed silently on the phone (the desktop
 * app fetches from the Node main process, where CORS does not apply).
 *
 * Browsers ALSO silently drop the `User-Agent` request header (it is a
 * forbidden header name), so the clash.meta UA fallback never actually
 * reached the server over `fetch()`.
 *
 * CapacitorHttp issues the request from native code (OkHttp). No CORS, and
 * arbitrary headers — including User-Agent — are honoured. We use it whenever
 * running on a native platform and fall back to `fetch()` on the web/Electron.
 */

const FETCH_TIMEOUT_MS = 30_000

const FALLBACK_USER_AGENTS = [
  'clash.meta',
  'Mihomo/1.18.7',
  'ClashX/1.8.0',
  'Clash/2.0.4.8 (Windows)',
] as const

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function fetchOnceNative(url: string, ua: string): Promise<{ status: number; text: string }> {
  const res = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': ua, Accept: '*/*' },
    // OkHttp connect/read timeout (ms)
    connectTimeout: FETCH_TIMEOUT_MS,
    readTimeout: FETCH_TIMEOUT_MS,
    responseType: 'text',
  })
  const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  return { status: res.status, text }
}

async function fetchOnceWeb(url: string, ua: string): Promise<{ status: number; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: '*/*' },
      signal: controller.signal,
    })
    const text = await res.text()
    return { status: res.status, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download a subscription body as text, retrying across a set of common
 * Clash/Mihomo user-agents (some providers gate on UA). Uses native HTTP on
 * Android to dodge CORS; plain fetch elsewhere.
 *
 * Throws the last error if every attempt fails.
 */
export async function fetchSubscriptionText(url: string): Promise<string> {
  const native = isNative()
  let lastError: unknown
  for (const ua of FALLBACK_USER_AGENTS) {
    try {
      const { status, text } = native
        ? await fetchOnceNative(url, ua)
        : await fetchOnceWeb(url, ua)
      if (status < 200 || status >= 300) {
        lastError = new Error(`HTTP ${status}`)
        continue
      }
      if (!text || !text.trim()) {
        lastError = new Error('Empty response body')
        continue
      }
      if (text.includes('App not supported')) {
        lastError = new Error('Server rejected user-agent')
        continue
      }
      return text
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All user-agents failed')
}
