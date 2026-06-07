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
import { fetchSubscriptionText, fetchSubscriptionTextUA } from './native-fetch'

// UDP/QUIC protocols that Remnawave panels usually OMIT from the Clash profile
// (Clash historically lacked them) — they live in the sing-box format instead.
const UDP_PROTOCOLS = new Set(['hysteria2', 'hysteria', 'tuic'])
// Alt formats to pull ONLY to recover those protocols. sing-box JSON carries
// Hysteria2/TUIC; the VLESS-Reality-encryption nodes stay from the primary
// Clash fetch (sing-box can't represent enc), so we never replace them.
const ALT_FORMAT_UAS = ['SFA/1.0', 'sing-box/1.11.0'] as const

const nodeKey = (p: ProxyEntry): string => `${p.server}:${p.port}:${p.type}`

/**
 * Additively recover Hysteria2/TUIC nodes the Clash profile omitted, by pulling
 * the sing-box format and appending ONLY nodes whose server:port:type isn't
 * already present. Best-effort: any failure leaves the primary list untouched.
 */
async function recoverUdpProtocolNodes(input: string, primary: ProxyEntry[]): Promise<ProxyEntry[]> {
  // Already have them (panel did include hy2 in Clash) → no extra fetch.
  if (primary.some(p => UDP_PROTOCOLS.has(p.type))) return []
  const seen = new Set(primary.map(nodeKey))
  const added: ProxyEntry[] = []
  for (const ua of ALT_FORMAT_UAS) {
    const raw = await fetchSubscriptionTextUA(input, ua)
    if (!raw) continue
    let alt: ProxyEntry[]
    try { alt = parseProxiesFromYaml(normalizeSubscriptionContent(raw).yaml) } catch { continue }
    for (const p of alt) {
      if (!UDP_PROTOCOLS.has(p.type)) continue // only recover the missing UDP protocols
      const k = nodeKey(p)
      if (seen.has(k)) continue
      seen.add(k)
      added.push(p)
    }
    if (added.length > 0) break // got them — stop probing further formats
  }
  return added
}

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
    // Additively recover Hysteria2/TUIC nodes the Clash profile omitted (safe:
    // never replaces the primary VLESS-enc nodes). Only for remote subscriptions.
    if (entry.type === 'subscription-url') {
      try {
        const recovered = await recoverUdpProtocolNodes(input, proxies)
        if (recovered.length > 0) proxies.push(...recovered)
      } catch { /* best-effort — primary list stands */ }
    }
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
