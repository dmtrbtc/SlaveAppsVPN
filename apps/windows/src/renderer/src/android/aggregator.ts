import {
  normalizeSubscriptionContent,
  buildClashYaml,
  parseProxiesFromYaml,
  parseXrayConfigArray,
  type ProxyEntry,
} from '@slave-vpn/config'
// Shared aggregation kernel (dedup + uniquify + source-tag) — the SAME logic the
// Windows SubscriptionAggregatorService uses. Was duplicated here (P0.5 cleanup).
import { aggregateProxies, type FetchedEntry } from '@slave-vpn/core'
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
// Alt formats to pull ONLY to recover those protocols. Verified against the real
// panel: it serves Hysteria2 ONLY in the v2rayN/Xray array format (UA v2rayNG),
// NOT in clash or sing-box. We still try sing-box as a fallback. VLESS-Reality-
// encryption nodes stay from the primary Clash fetch, so they're never replaced.
const ALT_FORMAT_UAS = ['v2rayNG/1.8.5', 'SFA/1.0', 'sing-box/1.11.0'] as const

const nodeKey = (p: ProxyEntry): string => `${p.server}:${p.port}:${p.type}`

// Parse an alt-format body into proxies, handling BOTH the v2rayN/Xray
// array-of-configs shape (where some panels hide Hysteria2) and the
// clash/sing-box/base64/URI shapes our normalizer understands.
function parseAltBody(raw: string): ProxyEntry[] {
  const xray = parseXrayConfigArray(raw)
  if (xray.length > 0) return xray
  try { return parseProxiesFromYaml(normalizeSubscriptionContent(raw).yaml) } catch { return [] }
}

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
    const alt = parseAltBody(raw)
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
  // Fetch each enabled subscription (Android-specific: WebView HTTP + UDP recovery),
  // then hand the raw results to the shared core kernel, which does the dedup +
  // uniquify + per-source tagging identically to Windows (throws if no nodes).
  const results: FetchedEntry[] = []
  for (const entry of entries) {
    const input = await getSubscriptionInput(entry.id)
    if (!input) {
      results.push({ entry: { id: entry.id, name: entry.name }, proxies: [], error: 'input missing' })
      continue
    }
    const { proxies, error } = await fetchEntry(entry, input)
    results.push({ entry: { id: entry.id, name: entry.name }, proxies, error })
  }
  const { proxies, warnings } = aggregateProxies(results)
  return { proxies, warnings }
}

export async function buildAggregatedYaml(): Promise<AggregatedYaml> {
  const { proxies, warnings } = await buildAggregatedProxies()
  return { yaml: buildClashYaml(proxies), totalProxies: proxies.length, warnings }
}
