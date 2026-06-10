import { CapacitorHttp, Capacitor } from '@capacitor/core'
import type { NetworkAdapter, NetworkResponse, NetworkRequestOptions } from '@slave-vpn/core'
import { getDeviceHeaders } from '../device-id'

/**
 * Android NetworkAdapter — issues requests from native code (OkHttp via
 * CapacitorHttp) so they bypass the WebView's CORS policy and can carry
 * arbitrary headers (User-Agent, x-hwid), which a plain WebView `fetch()`
 * silently drops. Falls back to `fetch()` on web/Electron. Mirrors the proven
 * android/native-fetch.ts approach.
 *
 * The stable per-install x-hwid headers are attached by default (Remnawave
 * device-limit panels only serve real nodes with them); callers can override.
 */

const DEFAULT_TIMEOUT_MS = 30_000

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'text/plain, application/x-yaml, application/json, */*',
    ...getDeviceHeaders(),
    ...extra,
  }
}

export function createAndroidNetworkAdapter(): NetworkAdapter {
  return {
    async fetch(url: string, opts: NetworkRequestOptions = {}): Promise<NetworkResponse> {
      const method = opts.method ?? 'GET'
      const headers = buildHeaders(opts.headers)
      const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

      if (isNative()) {
        const fn = method === 'POST' ? CapacitorHttp.post : method === 'HEAD' ? CapacitorHttp.request : CapacitorHttp.get
        const res = await (method === 'HEAD'
          ? CapacitorHttp.request({ method: 'HEAD', url, headers, connectTimeout: timeout, readTimeout: timeout } as Parameters<typeof CapacitorHttp.request>[0])
          : fn({
              url,
              headers,
              ...(opts.body !== undefined ? { data: opts.body } : {}),
              connectTimeout: timeout,
              readTimeout: timeout,
              responseType: 'text',
            } as Parameters<typeof CapacitorHttp.get>[0]))
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const resHeaders = (res.headers ?? {}) as Record<string, string>
        return { status: res.status, body, headers: resHeaders }
      }

      // web / Electron fallback
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await fetch(url, {
          method,
          headers,
          ...(opts.body !== undefined ? { body: opts.body } : {}),
          signal: controller.signal,
        })
        const body = await res.text()
        const resHeaders: Record<string, string> = {}
        res.headers.forEach((v, k) => {
          resHeaders[k] = v
        })
        return { status: res.status, body, headers: resHeaders }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
