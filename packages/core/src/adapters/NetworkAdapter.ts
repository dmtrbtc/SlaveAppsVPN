/**
 * HTTP fetch that is NOT subject to a WebView's CORS / User-Agent stripping.
 *
 * Windows backs this with Node fetch/undici (main process); Android with
 * CapacitorHttp (OkHttp) so subscription fetches carry the right UA + x-hwid
 * headers and bypass CORS — the reason native-fetch.ts exists today.
 *
 * Used for: subscription downloads, geo/rule-provider downloads, the GitHub
 * update check, and connectivity probes.
 */
export interface NetworkResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export interface NetworkRequestOptions {
  method?: 'GET' | 'POST' | 'HEAD'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface NetworkAdapter {
  fetch(url: string, opts?: NetworkRequestOptions): Promise<NetworkResponse>
}
