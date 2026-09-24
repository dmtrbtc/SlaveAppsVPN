import { normalizeSubscriptionContent, buildClashYaml, parseProxiesFromYaml } from '@slave-vpn/config'
import type { ProxyEntry } from '@slave-vpn/config'
import type { ConfigSource } from '@slave-vpn/provider'
import { getSubscriptionStore } from './SubscriptionStore'
import { getSettingsStore } from './SettingsStore'
import { getConfigSourceService } from './impl/ConfigSourceService'
import { SubscriptionUrlSource } from './impl/sources/SubscriptionUrlSource'
import { SingleProxySource } from './impl/sources/SingleProxySource'
import { RemnawaveKeySource } from './impl/sources/RemnawaveKeySource'
import { getLogger } from '../logger'
import type { SubscriptionEntry, ConfigSourceType } from '../../shared/ipc/types'
import { aggregateProxies, canonicalSubscriptionSource } from '@slave-vpn/core'
import { createHash } from 'crypto'

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

// Dedup + uniquify + source-tag + soft-cap now live in @slave-vpn/core
// (aggregateProxies) — shared with Android.

// ─── Service ──────────────────────────────────────────────────────────────────

export interface AggregatedSnapshot {
  yaml: string
  totalProxies: number
  perSubscription: Record<string, number>  // id → count after dedup
  warnings: string[]
  builtAt: number
  revision: number
  hash: string
}

interface SourceResult {
  entry: { id: string; name: string }
  proxies: ProxyEntry[]
  error: string | null
}

function logicalNodeKey(proxy: ProxyEntry): string {
  const baseName = proxy.name.replace(/ #\d+$/, '').trim()
  return [baseName, proxy.type, proxy.server, proxy.port, proxy.transport ?? 'tcp'].join('|')
}

function logicalNodeLabelKey(proxy: ProxyEntry): string {
  const baseName = proxy.name.replace(/ #\d+$/, '').trim()
  return [baseName, proxy.type].join('|')
}

function removeSourcesSupersededByConfigSource(
  configSource: SourceResult | null,
  storeResults: SourceResult[],
): { results: SourceResult[]; removedSources: number; removedNodes: number } {
  if (!configSource || configSource.proxies.length === 0) {
    return { results: storeResults, removedSources: 0, removedNodes: 0 }
  }
  const currentNodes = new Set(configSource.proxies.map(logicalNodeKey))
  const currentLabels = new Set(configSource.proxies.map(logicalNodeLabelKey))
  let removedSources = 0
  let removedNodes = 0
  const results = storeResults.filter(result => {
    const exactTopologyMatch = result.proxies.length > 0
      && result.proxies.every(proxy => currentNodes.has(logicalNodeKey(proxy)))
    const storedLabels = new Set(result.proxies.map(logicalNodeLabelKey))
    const rotatedTopologyMatch = result.proxies.length > 1
      && storedLabels.size === result.proxies.length
      && result.proxies.every(proxy => currentLabels.has(logicalNodeLabelKey(proxy)))
    if (!exactTopologyMatch && !rotatedTopologyMatch) {
      return true
    }
    // Cabinet imports can rotate their URL/key and credentials. The old source
    // can also rotate endpoints while keeping the complete multi-node name/type
    // set. Retaining that stale copy creates #2 nodes and can keep obsolete
    // endpoints active. A loose match never suppresses a one-node subscription,
    // and partial overlaps remain independent. Prefer the current ConfigSource.
    removedSources++
    removedNodes += result.proxies.length
    return false
  })
  return { results, removedSources, removedNodes }
}

export class SubscriptionAggregatorService {
  private lastSnapshot: AggregatedSnapshot | null = null
  private snapshotDirty = true
  private snapshotRevision = 0
  private invalidationRevision = 0
  private operationTail: Promise<void> = Promise.resolve()
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.operationTail.then(action)
    this.operationTail = operation.then(() => undefined, () => undefined)
    return operation
  }
  private readonly cachedResults = new Map<string, SourceResult>()
  private cachedConfigSource: SourceResult | null = null
  private cabinetSource: ConfigSource | null = null
  private cabinetFetchedAt = 0
  private readonly fetchedAt = new Map<string, number>()
  private readonly freshnessMs = 5 * 60_000
  private configSourceCacheInitialized = false
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
    ++this.invalidationRevision
    const source = this.sources.get(id)
    if (source && 'invalidateCache' in source && typeof source.invalidateCache === 'function') {
      source.invalidateCache()
    }
    this.sources.delete(id)
    this.cachedResults.delete(id)
    this.fetchedAt.delete(id)
    this.snapshotDirty = true
  }

  invalidateAll(): void {
    ++this.invalidationRevision
    this.sources.clear()
    this.cachedResults.clear()
    this.fetchedAt.clear()
    this.cabinetSource = null
    this.cabinetFetchedAt = 0
    this.cachedConfigSource = null
    this.configSourceCacheInitialized = false
    this.lastSnapshot = null
    this.snapshotDirty = true
  }

  // Structural mutations (enable/disable/reorder/rename) only require rebuilding
  // the aggregate from already parsed source data. They must not invalidate HTTP
  // caches or download every subscription again.
  invalidateSnapshot(): void {
    ++this.invalidationRevision
    this.snapshotDirty = true
  }

  invalidateConfigSource(): void {
    this.cabinetSource = null
    this.cabinetFetchedAt = 0
    this.cachedConfigSource = null
    this.configSourceCacheInitialized = false
    this.invalidateSnapshot()
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
      // Keep the last-known-good nodes for this source. A transient failure of
      // one provider must not collapse an otherwise healthy aggregate.
      return { proxies: this.cachedResults.get(entry.id)?.proxies ?? [], error: message }
    }
  }

  // Fetch the legacy/cabinet ConfigSource (single source: the personal cabinet
  // import, or a manually-pasted «Подписка-URL») as an aggregation input, so its
  // nodes coexist with the multi-subscription store instead of being replaced.
  // Cabinet writes ONLY to ConfigSourceService; the store holds third-party keys —
  // without this merge, adding an external key made the cabinet's servers vanish.
  private async fetchConfigSourceResult(): Promise<SourceResult | null> {
    const cfg = getConfigSourceService()
    const meta = cfg.getMeta()
    if (!meta) return null
    const name = meta.displayName || 'Личный кабинет'
    const entry = { id: '__config-source__', name }
    const source = this.cabinetSource ?? cfg.createConfigSource()
    this.cabinetSource = source
    if (!source) return { entry, proxies: [], error: 'Cannot create cabinet config source' }
    try {
      const rawYaml = await source.fetchYaml()
      let workingYaml = rawYaml
      try {
        workingYaml = normalizeSubscriptionContent(rawYaml).yaml
      } catch { /* already clash YAML */ }
      return { entry, proxies: parseProxiesFromYaml(workingYaml), error: null }
    } catch (err) {
      return {
        entry,
        proxies: this.cachedConfigSource?.proxies ?? [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private buildSnapshot(results: SourceResult[]): AggregatedSnapshot {
    const log = getLogger()
    const { proxies: deduped, perSubscription, warnings } = aggregateProxies(results)
    const yaml = buildClashYaml(deduped)
    const hash = createHash('sha256').update(yaml).digest('hex')
    const previous = this.lastSnapshot
    if (!previous || previous.hash !== hash) this.snapshotRevision++
    const snapshot: AggregatedSnapshot = {
      yaml,
      totalProxies: deduped.length,
      perSubscription,
      warnings,
      builtAt: Date.now(),
      revision: this.snapshotRevision,
      hash,
    }
    this.lastSnapshot = snapshot
    this.snapshotDirty = false
    log.info({
      totalProxies: deduped.length,
      sources: results.length,
      warnings: snapshot.warnings.length,
      snapshotRevision: snapshot.revision,
      snapshotHash: snapshot.hash.slice(0, 12),
    }, 'Aggregator: snapshot built')
    return snapshot
  }

  private async rebuildFromCachedSources(checkFreshness = false): Promise<AggregatedSnapshot> {
    const revision = this.invalidationRevision
    const entries = getSubscriptionStore().list().filter(e => e.enabled)
    const storeResults = await Promise.all(entries.map(async (entry) => {
      const cached = this.cachedResults.get(entry.id)
      if (cached && (!checkFreshness || Date.now() - (this.fetchedAt.get(entry.id) ?? 0) < this.freshnessMs)) {
        return { ...cached, entry: { id: entry.id, name: entry.name } }
      }
      const result = await this.fetchOne(entry)
      const sourceResult = { entry: { id: entry.id, name: entry.name }, ...result }
      if (revision === this.invalidationRevision) {
        this.cachedResults.set(entry.id, sourceResult)
        this.fetchedAt.set(entry.id, Date.now())
      }
      return sourceResult
    }))

    const configSourceService = getConfigSourceService()
    const configSourceIdentity = configSourceService.getCanonicalSourceIdentity?.() ?? null
    const configSourceMeta = configSourceService.getMeta()
    const configSourceDomain = configSourceMeta?.type === 'subscription-url'
      ? configSourceMeta.urlDomain?.trim().toLowerCase()
      : undefined
    const configSourceDuplicatedByDomain = Boolean(configSourceDomain) && entries.some(entry =>
      entry.type === 'subscription-url'
      && entry.urlDomain?.trim().toLowerCase() === configSourceDomain)
    const configSourceDuplicatedExactly = configSourceIdentity !== null && entries.some(entry => {
      const input = getSubscriptionStore().getInput(entry.id)
      return input !== null && canonicalSubscriptionSource(entry.type, input) === configSourceIdentity
    })
    const configSourceDuplicated = configSourceDuplicatedExactly || configSourceDuplicatedByDomain

    if (configSourceDuplicated) {
      // A legacy/cabinet subscription may be copied into SubscriptionStore and
      // later receive a rotated URL. An enabled explicit subscription from the
      // same exact host is the visible source of truth; do not merge the hidden
      // compatibility copy. Different-provider subscriptions still combine.
      this.cachedConfigSource = null
      this.configSourceCacheInitialized = true
      this.cabinetFetchedAt = Date.now()
    } else if (!this.configSourceCacheInitialized || (this.cachedConfigSource === null && configSourceIdentity !== null)
      || (checkFreshness && Date.now() - this.cabinetFetchedAt >= this.freshnessMs)) {
      const cabinet = await this.fetchConfigSourceResult()
      if (revision === this.invalidationRevision) {
        this.cachedConfigSource = cabinet
        this.configSourceCacheInitialized = true
        this.cabinetFetchedAt = Date.now()
      }
    }
    const filtered = removeSourcesSupersededByConfigSource(this.cachedConfigSource, storeResults)
    if (filtered.removedSources > 0) {
      getLogger().info({ removedSources: filtered.removedSources, removedNodes: filtered.removedNodes },
        'Aggregator: superseded migrated sources ignored')
    }
    const results = this.cachedConfigSource ? [this.cachedConfigSource, ...filtered.results] : filtered.results
    if (revision !== this.invalidationRevision) return this.rebuildFromCachedSources(checkFreshness)
    if (results.length === 0) throw new Error('No enabled subscriptions')
    return this.buildSnapshot(results)
  }

  // Fetch+merge everything that's enabled. Returns the aggregated YAML and a snapshot.
  async fetchAggregatedYaml(): Promise<AggregatedSnapshot> {
    return this.enqueue(() => this.fetchAllSources())
  }

  private async fetchAllSources(): Promise<AggregatedSnapshot> {
    return this.rebuildFromCachedSources(true)
  }

  getLastSnapshot(): AggregatedSnapshot | null {
    return this.snapshotDirty ? null : this.lastSnapshot
  }

  async getSnapshotOrFetch(checkFreshness = false): Promise<AggregatedSnapshot> {
    return this.enqueue(async () => {
      if (this.lastSnapshot && !this.snapshotDirty && !checkFreshness) return this.lastSnapshot
      return this.rebuildFromCachedSources(checkFreshness)
    })
  }

  async refreshOne(id: string): Promise<SubscriptionEntry | null> {
    return this.enqueue(() => this.refreshSource(id))
  }

  private expireSource(id: string): void {
    const source = this.sources.get(id)
    if (source && 'invalidateCache' in source && typeof source.invalidateCache === 'function') {
      source.invalidateCache()
    } else {
      this.sources.delete(id)
    }
    this.snapshotDirty = true
  }

  private async refreshSource(id: string): Promise<SubscriptionEntry | null> {
    const entry = getSubscriptionStore().getById(id)
    if (!entry || !entry.enabled) return entry ?? null
    const revision = this.invalidationRevision
    this.expireSource(id)
    const result = await this.fetchOne(entry)
    if (revision === this.invalidationRevision) {
      this.cachedResults.set(id, { entry: { id: entry.id, name: entry.name }, ...result })
      this.fetchedAt.set(id, Date.now())
    }
    await this.rebuildFromCachedSources()
    const { error } = result
    void error  // already recorded in recordFetch
    return getSubscriptionStore().getById(id)
  }

  async refreshAll(): Promise<SubscriptionEntry[]> {
    return this.enqueue(() => this.refreshSources())
  }

  private async refreshSources(): Promise<SubscriptionEntry[]> {
    const revision = this.invalidationRevision
    const list = getSubscriptionStore().list().filter(entry => entry.enabled)
    await Promise.all(list.map(async (entry) => {
      this.expireSource(entry.id)
      const result = await this.fetchOne(entry)
      if (revision === this.invalidationRevision) {
        this.cachedResults.set(entry.id, { entry: { id: entry.id, name: entry.name }, ...result })
        this.fetchedAt.set(entry.id, Date.now())
      }
    }))
    if (this.cabinetSource && 'invalidateCache' in this.cabinetSource && typeof this.cabinetSource.invalidateCache === 'function') {
      this.cabinetSource.invalidateCache()
    }
    const cabinet = await this.fetchConfigSourceResult()
    if (revision === this.invalidationRevision) {
      this.cachedConfigSource = cabinet
      this.configSourceCacheInitialized = true
      this.cabinetFetchedAt = Date.now()
    }
    await this.rebuildFromCachedSources()
    return getSubscriptionStore().list()
  }
}

let _instance: SubscriptionAggregatorService | null = null
export function getSubscriptionAggregator(): SubscriptionAggregatorService {
  if (!_instance) _instance = new SubscriptionAggregatorService()
  return _instance
}
