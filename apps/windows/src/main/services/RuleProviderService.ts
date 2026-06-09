import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getLogger } from '../logger'
import {
  RULE_PROVIDER_PRESETS,
  mergeWithPresets,
  persistableProviders,
  sortByPriority,
  addProvider,
  removeProvider,
  updateProvider,
  reorderProviders,
} from '@slave-vpn/core'
import type { RuleProvider, RuleProviderAddPayload } from '../../shared/ipc/types'

// Presets + the pure CRUD kernel now live in @slave-vpn/core (RULE_PROVIDER_PRESETS
// + add/remove/update/reorder/merge). This service keeps the Windows fs
// persistence and the network `reload`.

export class RuleProviderService {
  private providers: RuleProvider[] = []
  private readonly storePath: string

  constructor() {
    const dataDir = join(app.getPath('userData'), 'rule-providers')
    mkdirSync(dataDir, { recursive: true })
    this.storePath = join(dataDir, 'providers.json')
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(this.storePath)) {
        const raw = readFileSync(this.storePath, 'utf-8')
        const parsed = JSON.parse(raw) as RuleProvider[]
        this.providers = mergeWithPresets(parsed)
      } else {
        this.providers = [...RULE_PROVIDER_PRESETS]
      }
    } catch (err) {
      getLogger().error({ err }, 'Failed to load rule providers, using defaults')
      this.providers = [...RULE_PROVIDER_PRESETS]
    }
  }

  private save(): void {
    writeFileSync(this.storePath, JSON.stringify(persistableProviders(this.providers), null, 2), 'utf-8')
  }

  list(): RuleProvider[] {
    return sortByPriority(this.providers)
  }

  add(payload: RuleProviderAddPayload): RuleProvider {
    const { providers, added } = addProvider(this.providers, payload, randomUUID())
    this.providers = providers
    this.save()
    return added
  }

  remove(id: string): void {
    this.providers = removeProvider(this.providers, id)
    this.save()
  }

  update(id: string, patch: Partial<Pick<RuleProvider, 'enabled' | 'action' | 'priority'>>): RuleProvider {
    const { providers, updated } = updateProvider(this.providers, id, patch)
    this.providers = providers
    this.save()
    return updated
  }

  reorder(ids: string[]): void {
    this.providers = reorderProviders(this.providers, ids)
    this.save()
  }

  async reload(): Promise<void> {
    // In production: fetch remote providers and update rule counts
    const remote = this.providers.filter(p => p.kind !== 'builtin' && p.enabled && p.url)
    for (const provider of remote) {
      try {
        const res = await fetch(provider.url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) {
          this.update(provider.id, {})
          continue
        }
        const text = await res.text()
        const lineCount = text.split('\n').filter(l => l.trim() && !l.startsWith('#')).length
        const idx = this.providers.findIndex(p => p.id === provider.id)
        const current = idx !== -1 ? this.providers[idx] : undefined
        if (current) {
          const next: RuleProvider = {
            ...current,
            ruleCount: lineCount,
            lastUpdatedAt: Date.now(),
          }
          delete (next as Partial<RuleProvider>).lastError
          this.providers[idx] = next
        }
        getLogger().info({ name: provider.name, lines: lineCount }, 'Rule provider updated')
      } catch (err) {
        const idx = this.providers.findIndex(p => p.id === provider.id)
        const current = idx !== -1 ? this.providers[idx] : undefined
        if (current) {
          this.providers[idx] = {
            ...current,
            lastError: err instanceof Error ? err.message : String(err),
          }
        }
      }
    }
    this.save()
  }
}

let _instance: RuleProviderService | null = null
export function getRuleProviderService(): RuleProviderService {
  if (!_instance) _instance = new RuleProviderService()
  return _instance
}
