import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getLogger } from '../logger'
import type { RuleProvider, RuleProviderAddPayload } from '../../shared/ipc/types'

const PRESETS: RuleProvider[] = [
  {
    id: 'builtin-russia-bypass',
    name: 'Russia Bypass',
    enabled: true,
    kind: 'builtin',
    url: '',
    type: 'domain-list',
    action: 'direct',
    priority: 100,
    category: 'russia-bypass',
    isPreset: true,
    ruleCount: 2000,
  },
  {
    id: 'builtin-private',
    name: 'Private Networks',
    enabled: true,
    kind: 'builtin',
    url: '',
    type: 'ip-cidr-list',
    action: 'direct',
    priority: 50,
    category: 'system',
    isPreset: true,
    ruleCount: 8,
  },
]

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
        // Merge presets
        const customIds = new Set(parsed.map(p => p.id))
        this.providers = [
          ...PRESETS.filter(p => !customIds.has(p.id)),
          ...parsed,
        ]
      } else {
        this.providers = [...PRESETS]
      }
    } catch (err) {
      getLogger().error({ err }, 'Failed to load rule providers, using defaults')
      this.providers = [...PRESETS]
    }
  }

  private save(): void {
    const custom = this.providers.filter(p => !p.isPreset)
    writeFileSync(this.storePath, JSON.stringify(custom, null, 2), 'utf-8')
  }

  list(): RuleProvider[] {
    return this.providers.slice().sort((a, b) => a.priority - b.priority)
  }

  add(payload: RuleProviderAddPayload): RuleProvider {
    const provider: RuleProvider = {
      id: randomUUID(),
      name: payload.name,
      enabled: true,
      kind: payload.url.includes('github.com') || payload.url.includes('raw.githubusercontent.com')
        ? 'github' : 'url',
      url: payload.url,
      type: payload.type,
      action: payload.action,
      priority: 1000 + this.providers.filter(p => !p.isPreset).length * 10,
      ...(payload.category ? { category: payload.category } : {}),
    }
    this.providers.push(provider)
    this.save()
    return provider
  }

  remove(id: string): void {
    const provider = this.providers.find(p => p.id === id)
    if (provider?.isPreset) throw new Error('Cannot remove built-in rule provider')
    this.providers = this.providers.filter(p => p.id !== id)
    this.save()
  }

  update(id: string, patch: Partial<Pick<RuleProvider, 'enabled' | 'action' | 'priority'>>): RuleProvider {
    const idx = this.providers.findIndex(p => p.id === id)
    if (idx === -1) throw new Error(`Rule provider not found: ${id}`)
    const current = this.providers[idx]
    if (!current) throw new Error(`Rule provider vanished: ${id}`)
    const next: RuleProvider = { ...current, ...patch }
    this.providers[idx] = next
    this.save()
    return next
  }

  reorder(ids: string[]): void {
    const byId = new Map(this.providers.map(p => [p.id, p]))
    const ordered = ids.map((id, i) => {
      const p = byId.get(id)
      if (!p) throw new Error(`Unknown provider id: ${id}`)
      return { ...p, priority: (i + 1) * 10 }
    })
    this.providers = ordered
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
