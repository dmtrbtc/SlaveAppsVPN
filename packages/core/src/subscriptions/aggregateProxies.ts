import type { ParsedProxy, FetchedEntry, AggregationResult } from './types.js'

/**
 * Pure aggregation kernel shared by both platforms.
 *
 * Unifies the dedup + uniquify + source-tagging logic that was duplicated in the
 * Windows SubscriptionAggregatorService and android/aggregator.ts. Takes the
 * already-fetched per-entry results and merges them into one deduped node list.
 *
 * Dedup key uses the richer Windows variant (includes reality public-key), which
 * is a superset of the Android key — safe for both.
 */

const SOFT_CAP_NODES = 500

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pickStringField(extra: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = extra[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return ''
}

// Two nodes are duplicates iff they share (type, server, port, identity, flow,
// sni, reality-pbk). Identity is uuid/password/cipher depending on protocol.
function dedupKey(entry: ParsedProxy): string {
  const e = entry.extra
  const identity = pickStringField(e, 'uuid', 'password', 'cipher')
  const flow = pickStringField(e, 'flow')
  const sni = pickStringField(e, 'sni', 'servername')
  const realityOpts = isObject(e['reality-opts']) ? (e['reality-opts'] as Record<string, unknown>) : null
  const pbk = realityOpts ? pickStringField(realityOpts, 'public-key') : ''
  const finalMask = 'slave-xray-finalmask' in e ? 'xray-finalmask' : ''
  return [entry.type, entry.server, entry.port, identity, flow, sni, pbk, finalMask].join('|')
}

function dedupEntries(entries: ParsedProxy[]): ParsedProxy[] {
  const seen = new Map<string, { source: unknown; names: Set<string> }>()
  const result: ParsedProxy[] = []
  for (const e of entries) {
    const key = dedupKey(e)
    const source = e.extra['slave-source']
    const previous = seen.get(key)
    if (!previous) {
      seen.set(key, { source, names: new Set([e.name]) })
    } else {
      // One provider can intentionally publish separate named profiles for
      // the same endpoint. Only the highest-priority source supplies them.
      if (previous.source !== source || previous.names.has(e.name)) continue
      previous.names.add(e.name)
    }
    result.push(e)
  }
  return result
}

// Ensure all proxy names are unique — mihomo silently drops duplicate names.
function uniquifyNames(entries: ParsedProxy[]): ParsedProxy[] {
  const used = new Set<string>()
  return entries.map((e) => {
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

export function aggregateProxies(
  results: readonly FetchedEntry[],
  opts: { softCap?: number } = {},
): AggregationResult {
  const softCap = opts.softCap ?? SOFT_CAP_NODES
  const warnings: string[] = []
  const all: ParsedProxy[] = []

  for (const { entry, proxies, error } of results) {
    if (error) warnings.push(`${entry.name}: ${error}`)
    for (const p of proxies) {
      // Tag each node with its source subscription so the UI can attribute it.
      all.push({ ...p, extra: { ...p.extra, 'slave-source': entry.id } })
    }
  }

  if (all.length === 0) {
    const summary = warnings.length > 0 ? warnings.join('; ') : 'no nodes returned'
    throw new Error(`Aggregation produced no nodes: ${summary}`)
  }

  const deduped = uniquifyNames(dedupEntries(all))

  if (deduped.length > softCap) {
    warnings.push(`Soft cap exceeded: ${deduped.length} nodes (limit ${softCap}). Engine may slow down.`)
  }

  const perSubscription: Record<string, number> = {}
  for (const { entry } of results) {
    perSubscription[entry.id] = deduped.filter((d) => d.extra['slave-source'] === entry.id).length
  }

  return { proxies: deduped, perSubscription, warnings }
}
