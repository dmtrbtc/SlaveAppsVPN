import {
  normalizeSubscriptionContent,
  parseProxiesFromYaml,
} from '@slave-vpn/config'

const FETCH_TIMEOUT_MS = 30_000

const FALLBACK_USER_AGENTS = [
  'clash.meta',
  'Mihomo/1.18.7',
  'ClashX/1.8.0',
  'Clash/2.0.4.8 (Windows)',
]

interface ValidateResult {
  valid: boolean
  displayName?: string
  error?: string
  nodeCount?: number
  protocols?: Record<string, number>
  sampleNodes?: Array<{ name: string; protocol: string; transport: string; security: string }>
}

async function fetchWithUaFallback(url: string): Promise<string> {
  let lastError: unknown
  for (const ua of FALLBACK_USER_AGENTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, Accept: '*/*' },
        signal: controller.signal,
      })
      if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue }
      const text = await res.text()
      if (!text.trim()) { lastError = new Error('Empty response body'); continue }
      if (text.includes('App not supported')) { lastError = new Error('Server rejected user-agent'); continue }
      return text
    } catch (err) {
      lastError = err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All user-agents failed')
}

export async function fetchSubscriptionPreview(url: string): Promise<ValidateResult> {
  // Validate URL syntactically first
  let displayName: string
  try {
    displayName = new URL(url).hostname
  } catch {
    return { valid: false, error: 'Invalid URL' }
  }

  try {
    const raw = await fetchWithUaFallback(url)
    const { yaml } = normalizeSubscriptionContent(raw)
    const proxies = parseProxiesFromYaml(yaml)

    const protocols: Record<string, number> = {}
    for (const p of proxies) {
      protocols[p.type] = (protocols[p.type] ?? 0) + 1
    }

    const sampleNodes = proxies.slice(0, 5).map(p => {
      const extra = p.extra as Record<string, unknown>
      const network = (typeof extra['network'] === 'string' ? extra['network'] : 'tcp') as string
      const tls = extra['tls'] === true || extra['security'] === 'reality' || extra['security'] === 'tls'
        ? (extra['security'] === 'reality' ? 'reality' : 'tls')
        : 'none'
      return {
        name: p.name,
        protocol: p.type,
        transport: network,
        security: tls,
      }
    })

    return {
      valid: proxies.length > 0,
      displayName,
      nodeCount: proxies.length,
      protocols,
      sampleNodes,
      ...(proxies.length === 0 ? { error: 'No proxies parsed from response' } : {}),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { valid: false, displayName, error: message }
  }
}
