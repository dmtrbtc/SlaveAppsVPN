import {
  CabinetClient,
  CabinetError,
  type NetworkAdapter,
  type NetworkRequestOptions,
  type StorageAdapter,
} from '@slave-vpn/core'
import { getSecureStorage } from '../security/SecureStorage'
import { getConfigSourceService } from './impl/ConfigSourceService'
import { getLogger } from '../logger'

/** Node fetch → NetworkAdapter. Main process is free of WebView CORS/UA issues. */
const nodeNetwork: NetworkAdapter = {
  async fetch(url: string, opts: NetworkRequestOptions = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
    try {
      const init: RequestInit = { method: opts.method ?? 'GET', signal: controller.signal }
      if (opts.headers) init.headers = opts.headers
      if (opts.body !== undefined) init.body = opts.body
      const res = await fetch(url, init)
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => { headers[k] = v })
      return { status: res.status, body: await res.text(), headers }
    } finally {
      clearTimeout(timer)
    }
  },
  async fetchBytes(url: string, opts: NetworkRequestOptions = {}) {
    const init: RequestInit = { method: opts.method ?? 'GET' }
    if (opts.headers) init.headers = opts.headers
    const res = await fetch(url, init)
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) }
  },
}

/** Encrypted-at-rest token storage (safeStorage) → StorageAdapter. */
const secureStorageAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const raw = getSecureStorage().read(key)
    if (raw == null) return null
    try { return JSON.parse(raw) as T } catch { return null }
  },
  async set<T>(key: string, value: T): Promise<void> {
    getSecureStorage().write(key, JSON.stringify(value))
  },
  async remove(key: string): Promise<void> {
    getSecureStorage().delete(key)
  },
  async keys(): Promise<string[]> { return [] },
}

/**
 * Personal-cabinet integration for Windows. Thin wrapper around the
 * platform-agnostic CabinetClient (from @slave-vpn/core) using Node fetch +
 * encrypted token storage. The Android bridge constructs the same client over
 * Capacitor adapters — identical behaviour on both platforms.
 */
export class CabinetService {
  private readonly client = new CabinetClient(nodeNetwork, secureStorageAdapter)

  getClient(): CabinetClient { return this.client }

  /**
   * Pull the cabinet's subscription URL and set it as the active config source.
   * The URL is handled entirely in the main process and never returned to the
   * renderer.
   */
  async importSubscription(): Promise<{ imported: boolean }> {
    const url = await this.client.getSubscriptionUrl()
    if (!url) return { imported: false }
    await getConfigSourceService().set('subscription-url', url)
    getLogger().info('Cabinet subscription imported as config source')
    return { imported: true }
  }
}

let instance: CabinetService | null = null
export function getCabinetService(): CabinetService {
  if (!instance) instance = new CabinetService()
  return instance
}

export { CabinetError }
