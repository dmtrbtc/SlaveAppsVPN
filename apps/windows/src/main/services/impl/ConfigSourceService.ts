import type { ConfigSource } from '@slave-vpn/provider'
import type { ConfigSourceMeta, ConfigSourceType, ConfigSourceValidateResult, NodePreview } from '../../../shared/ipc/types'
import { getSecureStorage } from '../../security/SecureStorage'
import { getSettingsStore } from '../SettingsStore'
import { getLogger } from '../../logger'
import { SubscriptionUrlSource } from './sources/SubscriptionUrlSource'
import { SingleProxySource, parseProxyLink } from './sources/SingleProxySource'
import { RemnawaveKeySource } from './sources/RemnawaveKeySource'
import { normalizeSubscriptionContent } from './sources/subscriptionNormalizer'

const STORAGE_KEY = 'config-source'

interface StoredConfigSource {
  type: ConfigSourceType
  input: string
  displayName: string
  addedAt: number
  urlDomain?: string
  proxyProtocol?: string
}

const PROBE_TIMEOUT_MS = 15_000

interface ProbeResult {
  displayName: string
  proxyCount: number
  protocols: Record<string, number>
  sampleNodes: NodePreview[]
}

async function probeUrl(url: string): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const UAs = ['Mihomo/1.18.7', 'clash.meta', 'ClashX/1.8.0']
    for (const ua of UAs) {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, Accept: 'text/plain, application/x-yaml, */*' },
        signal: controller.signal,
      })
      if (!res.ok) continue
      const text = await res.text()
      if (!text.trim()) continue

      try {
        const normalized = normalizeSubscriptionContent(text)
        const entries = extractProxiesFromYaml(normalized.yaml)
        return {
          displayName: new URL(url).hostname,
          proxyCount: normalized.proxyCount,
          protocols: buildProtocolMap(entries),
          sampleNodes: entries.slice(0, 5).map(e => ({
            name: e.name,
            protocol: e.proxyProtocol,
            transport: e.transport ?? 'tcp',
            security: e.securityType ?? 'none',
          })),
        }
      } catch {
        continue
      }
    }
    throw new Error('All User-Agent variants returned unusable responses')
  } finally {
    clearTimeout(timer)
  }
}

function buildProtocolMap(entries: ServerListEntry[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const e of entries) {
    const key = e.securityType === 'reality' ? 'reality'
      : e.securityType === 'tls' ? `${e.proxyProtocol}+tls`
      : e.proxyProtocol
    map[key] = (map[key] ?? 0) + 1
  }
  return map
}

class ConfigSourceService {
  getMeta(): ConfigSourceMeta | null {
    const raw = getSecureStorage().read(STORAGE_KEY)
    if (!raw) return null
    try {
      const stored = JSON.parse(raw) as StoredConfigSource
      const meta: ConfigSourceMeta = {
        type: stored.type,
        displayName: stored.displayName,
        addedAt: stored.addedAt,
      }
      if (stored.urlDomain) meta.urlDomain = stored.urlDomain
      if (stored.proxyProtocol) meta.proxyProtocol = stored.proxyProtocol
      return meta
    } catch {
      return null
    }
  }

  async validate(type: ConfigSourceType, input: string): Promise<ConfigSourceValidateResult> {
    const log = getLogger()

    if (type === 'provider') {
      return { valid: false, error: 'Provider type cannot be set via config source API' }
    }

    if (!input.trim()) {
      return { valid: false, error: 'Input is empty' }
    }

    try {
      switch (type) {
        case 'subscription-url': {
          new URL(input)  // throws if invalid URL
          const probe = await probeUrl(input)
          return {
            valid: true,
            displayName: `${probe.displayName} · ${probe.proxyCount} ${serversWord(probe.proxyCount)}`,
            nodeCount: probe.proxyCount,
            protocols: probe.protocols,
            sampleNodes: probe.sampleNodes,
          }
        }

        case 'single-proxy': {
          const parsed = parseProxyLink(input)
          const badge = parsed.securityType === 'reality' ? 'REALITY'
            : parsed.transport === 'ws' ? 'WS'
            : parsed.transport === 'grpc' ? 'gRPC'
            : parsed.type.toUpperCase()
          return {
            valid: true,
            displayName: `${parsed.name} · ${badge}`,
            nodeCount: 1,
            protocols: { [parsed.securityType === 'reality' ? 'reality' : parsed.type]: 1 },
            sampleNodes: [{
              name: parsed.name,
              protocol: parsed.type,
              transport: parsed.transport ?? 'tcp',
              security: parsed.securityType ?? 'none',
            }],
          }
        }

        case 'remnawave-key': {
          if (input.trim().length < 8) {
            return { valid: false, error: 'Access key is too short' }
          }
          const settings = getSettingsStore()
          const url = `${settings.get('apiBaseUrl').replace(/\/$/, '')}/sub/${input.trim()}`
          const probe = await probeUrl(url)
          return {
            valid: true,
            displayName: `Remnawave · ${probe.displayName} · ${probe.proxyCount} ${serversWord(probe.proxyCount)}`,
            nodeCount: probe.proxyCount,
            protocols: probe.protocols,
            sampleNodes: probe.sampleNodes,
          }
        }
      }
    } catch (err: unknown) {
      log.warn({ err, type }, 'Config source validation failed')
      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, error: message }
    }
  }

  async set(type: ConfigSourceType, input: string): Promise<ConfigSourceMeta> {
    const result = await this.validate(type, input)
    if (!result.valid) {
      throw new Error(result.error ?? 'Validation failed')
    }

    let urlDomain: string | undefined
    let proxyProtocol: string | undefined

    if (type === 'subscription-url') {
      try { urlDomain = new URL(input).hostname } catch { /* ignore */ }
    } else if (type === 'single-proxy') {
      try {
        const parsed = parseProxyLink(input)
        proxyProtocol = parsed.type
      } catch { /* ignore */ }
    } else if (type === 'remnawave-key') {
      const settings = getSettingsStore()
      try { urlDomain = new URL(settings.get('apiBaseUrl')).hostname } catch { /* ignore */ }
    }

    const stored: StoredConfigSource = {
      type,
      input: input.trim(),
      displayName: result.displayName ?? input.trim(),
      addedAt: Date.now(),
      ...(urlDomain ? { urlDomain } : {}),
      ...(proxyProtocol ? { proxyProtocol } : {}),
    }

    getSecureStorage().write(STORAGE_KEY, JSON.stringify(stored))
    getLogger().info({ type }, 'Config source stored')

    const meta: ConfigSourceMeta = {
      type: stored.type,
      displayName: stored.displayName,
      addedAt: stored.addedAt,
    }
    if (stored.urlDomain) meta.urlDomain = stored.urlDomain
    if (stored.proxyProtocol) meta.proxyProtocol = stored.proxyProtocol
    return meta
  }

  clear(): void {
    getSecureStorage().delete(STORAGE_KEY)
    getLogger().info('Config source cleared')
  }

  createConfigSource(): ConfigSource | null {
    const raw = getSecureStorage().read(STORAGE_KEY)
    if (!raw) return null

    try {
      const stored = JSON.parse(raw) as StoredConfigSource

      switch (stored.type) {
        case 'subscription-url':
          return new SubscriptionUrlSource(stored.input)

        case 'single-proxy':
          return new SingleProxySource(stored.input)

        case 'remnawave-key': {
          const settings = getSettingsStore()
          return new RemnawaveKeySource(stored.input, settings.get('apiBaseUrl'))
        }

        default:
          return null
      }
    } catch (err: unknown) {
      getLogger().error({ err }, 'Failed to create config source from stored data')
      return null
    }
  }

  async getServerList(): Promise<ServerListEntry[]> {
    const raw = getSecureStorage().read(STORAGE_KEY)
    if (!raw) return []

    try {
      const stored = JSON.parse(raw) as StoredConfigSource

      if (stored.type === 'single-proxy') {
        const parsed = parseProxyLink(stored.input)
        const entry: ServerListEntry = {
          id: '1',
          name: parsed.name,
          server: parsed.server,
          proxyProtocol: parsed.type,
          ...(parsed.transport ? { transport: parsed.transport } : {}),
          ...(parsed.securityType ? { securityType: parsed.securityType } : {}),
        }
        return [entry]
      }

      if (stored.type === 'subscription-url' || stored.type === 'remnawave-key') {
        const source = this.createConfigSource()
        if (!source) return []
        const yaml = await source.fetchYaml()
        return extractProxiesFromYaml(yaml)
      }
    } catch {
      // ignored
    }
    return []
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServerListEntry {
  id: string
  name: string
  server: string
  proxyProtocol: string
  transport?: string
  securityType?: string
}

// ─── YAML proxy extractor (line-by-line, no yaml lib dependency) ──────────────

function extractProxiesFromYaml(yaml: string): ServerListEntry[] {
  const results: ServerListEntry[] = []
  const lines = yaml.split('\n')

  let inProxies = false
  let currentProxy: Partial<{
    name: string; server: string; type: string; network: string
    tls: boolean; realityOpts: boolean
  }> = {}
  let idx = 0
  let depth = 0  // track indentation to detect end of proxies section

  const flush = () => {
    if (currentProxy.name && currentProxy.server) {
      const securityType = currentProxy.realityOpts ? 'reality'
        : currentProxy.tls ? 'tls'
        : 'none'
      results.push({
        id: String(++idx),
        name: currentProxy.name,
        server: currentProxy.server,
        proxyProtocol: currentProxy.type ?? 'unknown',
        transport: currentProxy.network ?? 'tcp',
        securityType,
      })
    }
    currentProxy = {}
  }

  for (const line of lines) {
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    if (/^proxies\s*:/.test(trimmed)) {
      inProxies = true
      depth = indent
      continue
    }

    if (!inProxies) continue

    // End of proxies section: top-level key at same indent as "proxies:"
    if (/^[a-zA-Z]/.test(trimmed) && indent <= depth && !/^-\s/.test(trimmed)) {
      flush()
      inProxies = false
      continue
    }

    // New proxy entry
    if (/^-\s/.test(trimmed)) {
      flush()
      // Inline name on same line: "- name: ..."
      const inlineNameMatch = trimmed.match(/^-\s+name:\s*["']?(.+?)["']?\s*$/)
      if (inlineNameMatch?.[1]) currentProxy.name = inlineNameMatch[1].trim()
      continue
    }

    // Field extraction
    const nameMatch = trimmed.match(/^name:\s*["']?(.+?)["']?\s*$/)
    if (nameMatch?.[1]) { currentProxy.name = nameMatch[1].trim(); continue }

    const serverMatch = trimmed.match(/^server:\s*(.+?)\s*$/)
    if (serverMatch?.[1]) { currentProxy.server = serverMatch[1].trim(); continue }

    const typeMatch = trimmed.match(/^type:\s*(\S+)/)
    if (typeMatch?.[1]) { currentProxy.type = typeMatch[1].trim(); continue }

    const networkMatch = trimmed.match(/^network:\s*(\S+)/)
    if (networkMatch?.[1]) { currentProxy.network = networkMatch[1].trim(); continue }

    if (/^tls:\s*true/.test(trimmed)) { currentProxy.tls = true; continue }
    if (/^reality-opts\s*:/.test(trimmed)) { currentProxy.realityOpts = true; currentProxy.tls = true; continue }
  }

  flush()
  return results
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serversWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'сервер'
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'сервера'
  return 'серверов'
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: ConfigSourceService | null = null

export function getConfigSourceService(): ConfigSourceService {
  if (!_instance) _instance = new ConfigSourceService()
  return _instance
}
