import { CapacitorHttp, Capacitor } from '@capacitor/core'
import { getDeviceHeaders } from './device-id'

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
 * arbitrary headers — including User-Agent and x-hwid — are honoured. We use
 * it whenever running on a native platform and fall back to `fetch()` on the
 * web/Electron.
 *
 * HWID: Remnawave panels with the device-limit feature only return real nodes
 * when the request carries an `x-hwid` header. Without it they serve a
 * placeholder ("App not supported" / empty proxy list). We send a stable
 * per-install id (see device-id.ts) on every request.
 *
 * UA / FORMAT GATING: a single Remnawave subscription serves DIFFERENT content
 * per User-Agent — clash.meta may yield an EMPTY clash YAML while a sing-box /
 * generic UA yields base64-encoded vless:// links (which our normalizer
 * handles). So we try several UAs and skip any response that is a placeholder,
 * empty, or a format we can't parse, until one returns usable nodes.
 */

const FETCH_TIMEOUT_MS = 30_000

const FALLBACK_USER_AGENTS = [
  'clash.meta',          // clash/mihomo-native panels → clash YAML
  'sing-box/1.11.0',     // Remnawave → base64 vless:// links / sing-box JSON
  'v2rayNG/1.8.5',       // some panels gate real nodes behind a "known app" UA
  'SFA/1.0',             // sing-box for Android → sing-box JSON
  '',                    // bare UA → many panels fall back to base64 links
] as const

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function buildHeaders(ua: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'text/plain, application/x-yaml, application/json, */*',
    ...getDeviceHeaders(),
  }
  // An empty UA means "let the platform send its default" — omit the header.
  if (ua) headers['User-Agent'] = ua
  return headers
}

async function fetchOnceNative(url: string, ua: string): Promise<{ status: number; text: string }> {
  const res = await CapacitorHttp.get({
    url,
    headers: buildHeaders(ua),
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
      headers: buildHeaders(ua),
      signal: controller.signal,
    })
    const text = await res.text()
    return { status: res.status, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Decide whether a response body is worth handing to the parser. Rejects the
 * Remnawave HWID/UA placeholders and formats our normalizer cannot read, so
 * the caller keeps trying other user-agents instead of failing on the first
 * empty answer.
 */
function looksUsable(text: string): boolean {
  const t = text.trim()
  if (!t) return false

  // Remnawave placeholder served when the device/UA is not accepted.
  if (t.includes('App not supported')) return false

  // v2rayNG / Xray JSON config array (e.g. `[{"dns":...,"outbounds":[...]}]`).
  // Our normalizer does not understand this shape — skip so we try another UA
  // that yields base64 links or sing-box JSON instead.
  if (/^\[\s*\{/.test(t) && t.includes('"outbounds"')) return false

  // Clash YAML with an empty proxy list (`proxies: []`, or a `proxies:` block
  // with no `- name:` entries) — this is what clash.meta returns for a panel
  // whose hosts aren't exposed in clash format.
  if (/^proxies\s*:/m.test(t)) {
    if (/^proxies\s*:\s*\[\s*\]\s*$/m.test(t)) return false
    const after = t.split(/^proxies\s*:/m)[1] ?? ''
    const block = after.split(/^\S/m)[0] ?? after
    if (!/^[ \t]*-[ \t]/m.test(block)) return false
  }

  return true
}

/**
 * Download a subscription body as text, retrying across a set of common
 * user-agents (providers gate both on UA and on the x-hwid device header).
 * Uses native HTTP on Android to dodge CORS; plain fetch elsewhere.
 *
 * Returns the first response that carries usable node data. If every attempt
 * is a placeholder/empty, throws the most informative error so the UI can tell
 * the user it's an HWID / device-limit / empty-subscription situation rather
 * than a generic parse failure.
 */
export async function fetchSubscriptionText(url: string): Promise<string> {
  const native = isNative()
  let lastError: unknown
  let sawPlaceholder = false

  for (const ua of FALLBACK_USER_AGENTS) {
    try {
      const { status, text } = native
        ? await fetchOnceNative(url, ua)
        : await fetchOnceWeb(url, ua)

      if (status === 404 || status === 403) {
        // Remnawave returns 404/403 for an unknown/over-limit HWID, NOT "no
        // servers". Surface that distinction so the user checks the device
        // limit instead of blaming the subscription.
        sawPlaceholder = true
        lastError = new Error(
          `HTTP ${status}: подписка отклонила запрос (HWID/лимит устройств). ` +
          `Проверьте лимит устройств в панели подписки.`,
        )
        continue
      }
      if (status < 200 || status >= 300) {
        lastError = new Error(`HTTP ${status}`)
        continue
      }
      if (!text || !text.trim()) {
        lastError = new Error('Empty response body')
        continue
      }
      if (text.includes('App not supported')) {
        sawPlaceholder = true
        lastError = new Error(
          'Сервер вернул заглушку «App not supported» — проверьте лимит устройств (HWID) в панели подписки',
        )
        continue
      }
      if (!looksUsable(text)) {
        sawPlaceholder = true
        lastError = new Error('Подписка не содержит серверов для этого клиента')
        continue
      }
      return text
    } catch (err) {
      lastError = err
    }
  }

  if (sawPlaceholder) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Подписка не вернула серверов (возможен лимит устройств / HWID)')
  }
  throw lastError instanceof Error ? lastError : new Error('All user-agents failed')
}
