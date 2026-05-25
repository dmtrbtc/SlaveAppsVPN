import { normalizeSubscriptionContent, buildClashYaml, parseProxiesFromYaml } from '@slave-vpn/config'
import type { ProxyEntry } from '@slave-vpn/config'
import type { ConfigSource } from '@slave-vpn/provider'
import { getSubscriptionStore } from './SubscriptionStore'
import { getSettingsStore } from './SettingsStore'
import { SubscriptionUrlSource } from './impl/sources/SubscriptionUrlSource'
import { SingleProxySource } from './impl/sources/SingleProxySource'
import { RemnawaveKeySource } from './impl/sources/RemnawaveKeySource'
import { getLogger } from '../logger'
import type { SubscriptionEntry, ConfigSourceType } from '../../shared/ipc/types'

const SOFT_CAP_NODES = 500

// ─── Source factory ──────────────────────────────────────────────────────────

function createSourceFor(
  type: ConfigSourceType,
  rawInput: string,
): ConfigSource | null {
  switch (type) {
    case 'subscription-url':
      return new SubscriptionUrlSource(rawInput)
    case 'single-proxy':
      return new SingleProxySource(rawInput)
    case 'remnawave-key': {
      const apiBaseUrl = getSettingsStore().get('apiBaseUrl')
      return new RemnawaveKeySource(rawInput, apiBaseUrl)
    }
    case 'provider':
      return null  // not supported in multi-source — provider integration is its own path
    default:
      return null
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ─── Dedup ────────────────────────────────────────────────────────────────────
// Two nodes are duplicates iff they share (type, server, port, identity, flow, sni).
// Identity is uuid/password depending on protocol. Flow and SNI matter because the
// same VLESS endpoint with different flow/sni is a genuinely different node.

function pickStringField(extra: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extra[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

function dedupKey(entry: ProxyEntry): string {
  const e = entry.extra
  const identity = pickStringField(e, 'uuid', 'password', 'cipher')
  const flow = pickStringField(e, 'flow')
  const sni = pickStringField(e, 'sni', 'servername')
  const realityOpts = isObject(e['reality-opts']) ? (e['reality-opts'] as Record<string, unknown>) : null
  const pbk = realityOpts ? pickStringField(realityOpts as Record<string, unknown>, 'public-key') : ''
  return [entry.type, entry.server, entry.port, identity, flow, sni, pbk].join('|')
}

function dedupEntries(entries: ProxyEntry[]): ProxyEntry[] {
  const seen = new Map<string, ProxyEntry>()
  for (const e of entries) {
    const key = dedupKey(e)
    if (!seen.has(key)) {
      seen.set(key, e)
    }
  }
  return [...seen.values()]
}

// Ensure all proxy names are unique. Mihomo silently drops dupes otherwise.
function uniquifyNames(entries: ProxyEntry[]): ProxyEntry[] {
  const used = new Set<string>()
  return entries.map(e => {
    let name = e.name
    let suffix = 1
    while (used.has(name)) {
      suffix++
      name = `${e.name} #${suffix}`
    }
    used.add(name)
    return name === e.name ? e : { ...e, name }
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

interface AggregatedSnapshot {
  yaml: string
  totalProxies: number
  perSubscription: Record<string, number>  // id → count after dedup
  warnings: string[]
  builtAt: number
}

export class SubscriptionAggregatorService {
  private lastSnapshot: AggregatedSnapshot | null = null
  // In-memory ConfigSource cache, keyed by entry id, so repeated fetches reuse
  // the same source instance (which has its own HTTP cache).
  private readonly sources = new Map<string, ConfigSource>()

  private getOrCreateSource(entry: SubscriptionEntry): ConfigSource | null {
    const cached = this.sources.get(entry.id)
    if (cached) return cached
    const rawInput = getSubscriptionStore().getInput(entry.id)
    if (!rawInput) return null
    const source = createSourceFor(entry.type, rawInput)
    if (source) this.sources.set(entry.id, source)
    return source
  }

  // Invalidate the cached source after the user changes the entry.
  invalidate(id: string): void {
    const source = this.sources.get(id)
    if (source && 'invalidateCache' in source && typeof source.invalidateCache === 'function') {
      source.invalidateCache()
    }
    this.sources.delete(id)
  }

  private async fetchOne(entry: SubscriptionEntry): Promise<{ proxies: ProxyEntry[]; error: string | null }> {
    const store = getSubscriptionStore()
    const source = this.getOrCreateSource(entry)
    if (!source) {
      const err = 'Cannot create source — input missing or unsupported type'
      store.recordFetch(entry.id, { error: err, nodeCount: null })
      return { proxies: [], error: err }
    }

    try {
      const rawYaml = await source.fetchYaml()
      // single-proxy returns a ready clash YAML already; subscription-url returns normalized YAML.
      // We re-normalize defensively to handle base64/raw lists from RemnawaveKeySource.
      let workingYaml = rawYaml
      try {
        const normalized = normalizeSubscriptionContent(rawYaml)
        workingYaml = normalized.yaml
      } catch {
        // not parseable as a generic subscription — assume it's already clash YAML
      }
      const proxies = parseProxiesFromYaml(workingYaml)
      store.recordFetch(entry.id, { nodeCount: proxies.length, error: null })
      return { proxies, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      store.recordFetch(entry.id, { error: message })
      return { proxies: [], error: message }
    }
  }

  // Fetch+merge everything that's enabled. Returns the aggregated YAML and a snapshot.
  async fetchAggregatedYaml(): Promise<AggregatedSnapshot> {
    const log = getLogger()
    const entries = getSubscriptionStore().list().filter(e => e.enabled)
    if (entries.length === 0) {
      throw new Error('No enabled subscriptions')
    }

    const results = await Promise.all(entries.map(e => this.fetchOne(e).then(r => ({ entry: e, ...r }))))

    const all: ProxyEntry[] = []
    const perSubscription: Record<string, number> = {}
    const warnings: string[] = []

    for (const { entry, proxies, error } of results) {
      if (error) {
        warnings.push(`${entry.name}: ${error}`)
      }
      for (const p of proxies) {
        // Tag each node with its source subscription so UI can attribute it.
        const tagged: ProxyEntry = {
          ...p,
          extra: { ...p.extra, 'slave-source': entry.id },
        }
        all.push(tagged)
      }
    }

    if (all.length === 0) {
      const summary = warnings.length > 0 ? warnings.join('; ') : 'no nodes returned'
      throw new Error(`Aggregation produced no nodes: ${summary}`)
    }

    const deduped = uniquifyNames(dedupEntries(all))

    if (deduped.length > SOFT_CAP_NODES) {
      warnings.push(`Soft cap exceeded: ${deduped.length} nodes (limit ${SOFT_CAP_NODES}). Engine may slow down.`)
    }

    for (const { entry, proxies } of results) {
      perSubscription[entry.id] = deduped.filter(d => d.extra['slave-source'] === entry.id).length
      void proxies
    }

    const yaml = buildClashYaml(deduped)
    const snapshot: AggregatedSnapshot = {
      yaml,
      totalProxies: deduped.length,
      perSubscription,
      warnings,
      builtAt: Date.now(),
    }
    this.lastSnapshot = snapshot
    log.info({ totalProxies: deduped.length, sources: entries.length, warnings: warnings.length }, 'Aggregator: snapshot built')
    return snapshot
  }

  getLastSnapshot(): AggregatedSnapshot | null {
    return this.lastSnapshot
  }

  async refreshOne(id: string): Promise<SubscriptionEntry | null> {
    const entry = getSubscriptionStore().getById(id)
    if (!entry) return null
    this.invalidate(id)
    const { error } = await this.fetchOne(entry)
    void error  // already recorded in recordFetch
    return getSubscriptionStore().getById(id)
  }

  async refreshAll(): Promise<SubscriptionEntry[]> {
    const list = getSubscriptionStore().list()
    await Promise.all(list.map(e => this.refreshOne(e.id)))
    return getSubscriptionStore().list()
  }
}

let _instance: SubscriptionAggregatorService | null = null
export function getSubscriptionAggregator(): SubscriptionAggregatorService {
  if (!_instance) _instance = new SubscriptionAggregatorService()
  return _instance
}
