import {
  normalizeSubscriptionContent,
  buildClashYaml,
  parseProxiesFromYaml,
  type ProxyEntry,
} from '@slave-vpn/config'
import {
  listSubscriptions,
  getSubscriptionInput,
  updateSubscriptionMeta,
  type AndroidSubscriptionEntry,
} from './subscription-store'
import { fetchSubscriptionText } from './native-fetch'

/**
 * Renderer-side equivalent of SubscriptionAggregatorService — fetches every
 * enabled subscription (HTTP from the WebView), dedups by (type/server/port
 * /identity), and emits a single Clash YAML the SingboxConfigCompiler can
 * consume.
 *
 * Trimmed down vs the Windows aggregator:
 *   - subscription-url only (no Remnawave key flow yet — needs API client)
 *   - single-proxy URI supported
 *   - no per-source LRU cache (fetch every connect) — fine for now
 */

async function fetchEntry(
  entry: AndroidSubscriptionEntry,
  input: string,
): Promise<{ proxies: ProxyEntry[]; error: string | null }> {
  try {
    let yaml: string
    if (entry.type === 'subscription-url') {
      const raw = await fetchSubscriptionText(input)
      yaml = normalizeSubscriptionContent(raw).yaml
    } else if (entry.type === 'single-proxy') {
      // Treat input as a list of proxy URIs (one per line)
      yaml = normalizeSubscriptionContent(input).yaml
    } else {
      return { proxies: [], error: `Unsupported source type on Android: ${entry.type}` }
    }
    const proxies = parseProxiesFromYaml(yaml)
    await updateSubscriptionMeta(entry.id, {
      lastFetchedAt: Date.now(),
      lastError: null,
      nodeCount: proxies.length,
    })
    return { proxies, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updateSubscriptionMeta(entry.id, { lastError: message })
    return { proxies: [], error: message }
  }
}

function pickField(extra: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extra[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

function dedupKey(e: ProxyEntry): string {
  const identity = pickField(e.extra, 'uuid', 'password', 'cipher')
  const flow = pickField(e.extra, 'flow')
  const sni = pickField(e.extra, 'sni', 'servername')
  return [e.type, e.server, e.port, identity, flow, sni].join('|')
}

function dedup(entries: ProxyEntry[]): ProxyEntry[] {
  const seen = new Map<string, ProxyEntry>()
  for (const e of entries) {
    const k = dedupKey(e)
    if (!seen.has(k)) seen.set(k, e)
  }
  return [...seen.values()]
}

function uniquifyNames(entries: ProxyEntry[]): ProxyEntry[] {
  const used = new Set<string>()
  return entries.map(e => {
    let name = e.name
    let n = 1
    while (used.has(name)) {
      n++
      name = `${e.name} #${n}`
    }
    used.add(name)
    return name === e.name ? e : { ...e, name }
  })
}

export interface AggregatedProxies {
  proxies: ProxyEntry[]
  warnings: string[]
}

export interface AggregatedYaml {
  yaml: string
  totalProxies: number
  warnings: string[]
}

/**
 * Fetch every enabled subscription, parse + dedup nodes, and return the
 * deduped ProxyEntry[]. Throws if there are no subscriptions or no usable
 * nodes (so callers can surface a meaningful error). This is the single
 * source of truth for both the server LIST (servers.list) and the compiled
 * sing-box config (buildAggregatedYaml).
 */
export async function buildAggregatedProxies(): Promise<AggregatedProxies> {
  const entries = (await listSubscriptions()).filter(e => e.enabled)
  if (entries.length === 0) {
    throw new Error('Add a subscription first (Подписки)')
  }
  const warnings: string[] = []
  const all: ProxyEntry[] = []
  for (const entry of entries) {
    const input = await getSubscriptionInput(entry.id)
    if (!input) {
      warnings.push(`${entry.name}: input missing`)
      continue
    }
    const { proxies, error } = await fetchEntry(entry, input)
    if (error) warnings.push(`${entry.name}: ${error}`)
    for (const p of proxies) {
      all.push({ ...p, extra: { ...p.extra, 'slave-source': entry.id } })
    }
  }
  if (all.length === 0) {
    throw new Error(`No usable nodes (${warnings.join('; ') || 'no warnings'})`)
  }
  const deduped = uniquifyNames(dedup(all))
  return { proxies: deduped, warnings }
}

export async function buildAggregatedYaml(): Promise<AggregatedYaml> {
  const { proxies, warnings } = await buildAggregatedProxies()
  return { yaml: buildClashYaml(proxies), totalProxies: proxies.length, warnings }
}
