import {
  normalizeSubscriptionContent,
  parseProxiesFromYaml,
} from '@slave-vpn/config'
import { fetchSubscriptionText } from './native-fetch'

interface ValidateResult {
  valid: boolean
  displayName?: string
  error?: string
  nodeCount?: number
  protocols?: Record<string, number>
  sampleNodes?: Array<{ name: string; protocol: string; transport: string; security: string }>
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
    const raw = await fetchSubscriptionText(url)
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
