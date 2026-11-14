import {
  buildClashYaml,
  normalizeSubscriptionContent,
  parseProxiesFromYaml,
  parseXrayConfigArray,
  parseXrayFinalMaskEntries,
  mergeXrayFinalMaskEntries,
} from '@slave-vpn/config'
import type { ParsedProxy, SubscriptionEntry, SubscriptionFetcher } from './types.js'

export type SubscriptionFetchMeta = Partial<Pick<
  SubscriptionEntry, 'lastFetchedAt' | 'lastError' | 'nodeCount'
>>

/** Platform I/O only. Native HTTP owns HWID, timeouts and primary UA fallback;
 * core owns parsing, additive protocol recovery and fetch-result metadata. */
export interface SubscriptionSourceAdapter {
  getInput(id: string): Promise<string | null>
  updateMeta(id: string, patch: SubscriptionFetchMeta): Promise<void>
  fetchText(input: string): Promise<string>
  /** One explicit UA; null for unavailable/placeholder responses. */
  fetchTextWithUserAgent(input: string, userAgent: string): Promise<string | null>
  getCachedText?(id: string): Promise<string | null>
  setCachedText?(id: string, yaml: string): Promise<void>
}

const UDP_PROTOCOLS = new Set(['hysteria2', 'hysteria', 'tuic'])
const ALT_FORMAT_UAS = ['v2rayNG/1.8.5', 'SFA/1.0', 'sing-box/1.11.0'] as const
const nodeKey = (p: ParsedProxy): string => `${p.server}:${p.port}:${p.type}`

function parseAltBody(raw: string): ParsedProxy[] {
  const xray = parseXrayConfigArray(raw)
  if (xray.length > 0) return xray
  try { return parseProxiesFromYaml(normalizeSubscriptionContent(raw).yaml) } catch { return [] }
}

async function recoverAlternativeNodes(
  source: SubscriptionSourceAdapter,
  input: string,
  primary: ParsedProxy[],
): Promise<ParsedProxy[]> {
  const hasUdp = primary.some(p => UDP_PROTOCOLS.has(p.type))
  const seen = new Set(primary.map(nodeKey))
  const added: ParsedProxy[] = []
  let masked: ParsedProxy[] = []
  for (const ua of ALT_FORMAT_UAS) {
    if (hasUdp && ua !== ALT_FORMAT_UAS[0]) break
    const raw = await source.fetchTextWithUserAgent(input, ua).catch(() => null)
    if (!raw) continue
    if (masked.length === 0) masked = parseXrayFinalMaskEntries(raw)
    for (const p of hasUdp ? [] : parseAltBody(raw)) {
      // Never replace primary VLESS/REALITY encryption fields with alt formats.
      if (!UDP_PROTOCOLS.has(p.type)) continue
      const key = nodeKey(p)
      if (seen.has(key)) continue
      seen.add(key)
      added.push(p)
    }
    if (hasUdp || added.length > 0) break
  }
  return mergeXrayFinalMaskEntries([...primary, ...added], masked)
}

/** URL/URI source pipeline extracted from Android without changing its policy.
 * Other source kinds (e.g. Windows cabinet) keep their own fetchers for now. */
export function createSubscriptionFetcher(source: SubscriptionSourceAdapter): SubscriptionFetcher {
  return {
    async fetchEntry(entry) {
      const input = await source.getInput(entry.id)
      // Preserve missing-input behavior: aggregate a warning, do not touch meta.
      if (!input) return { proxies: [], error: 'input missing' }
      try {
        let raw: string
        if (entry.type === 'subscription-url') {
          raw = await source.fetchText(input)
        } else if (entry.type === 'single-proxy') {
          raw = input
        } else {
          return { proxies: [], error: `Unsupported subscription source type: ${entry.type}` }
        }
        const normalized = normalizeSubscriptionContent(raw)
        let proxies = parseProxiesFromYaml(normalized.yaml)
        if (entry.type === 'subscription-url') {
          try {
            proxies = await recoverAlternativeNodes(source, input, proxies)
          } catch { /* best-effort: the primary list stands */ }
        }
        if (entry.type === 'subscription-url' && proxies.length > 0 && source.setCachedText) {
          try { await source.setCachedText(entry.id, buildClashYaml(proxies)) } catch { /* best-effort LKG */ }
        }
        await source.updateMeta(entry.id, {
          lastFetchedAt: Date.now(),
          lastError: null,
          nodeCount: proxies.length,
        })
        return { proxies, error: normalized.warnings?.join(', ') || null }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await source.updateMeta(entry.id, { lastError: message })
        if (entry.type === 'subscription-url' && source.getCachedText) {
          try {
            const cached = await source.getCachedText(entry.id)
            if (cached) {
              const proxies = parseProxiesFromYaml(cached)
              if (proxies.length > 0) return { proxies, error: message }
            }
          } catch { /* invalid/missing cache keeps the original failure */ }
        }
        return { proxies: [], error: message }
      }
    },
  }
}
