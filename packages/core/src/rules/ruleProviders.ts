import type { RuleProvider, RuleProviderAddInput } from '../settings/types.js'
import { RULE_PROVIDER_PRESETS } from './presets.js'

/**
 * Pure rule-provider list operations — the platform-agnostic kernel of the
 * Windows RuleProviderService. The store/persistence (StorageAdapter) and the
 * network refresh (NetworkAdapter) are wired by the platform in P0.3/P0.4; these
 * helpers are deterministic transforms over the provider array.
 */

/** Merge persisted (custom) providers with the built-in presets — presets the
 * user hasn't overridden come first, then their stored copies. */
export function mergeWithPresets(stored: readonly RuleProvider[]): RuleProvider[] {
  const storedIds = new Set(stored.map((p) => p.id))
  return [...RULE_PROVIDER_PRESETS.filter((p) => !storedIds.has(p.id)), ...stored]
}

/** Only custom (non-preset) providers are persisted. */
export function persistableProviders(providers: readonly RuleProvider[]): RuleProvider[] {
  return providers.filter((p) => !p.isPreset)
}

export function sortByPriority(providers: readonly RuleProvider[]): RuleProvider[] {
  return [...providers].sort((a, b) => a.priority - b.priority)
}

/**
 * A bypass list in the shape the Android client tracks (mihomo rule-provider →
 * SLAVE-SELECT). Projection of the shared RULE_PROVIDER_PRESETS catalogue so the
 * Android default lists are NOT a second hardcoded source (P3 unification).
 */
export interface BypassRuleListDefault {
  id: string
  name: string
  url: string
  behavior: 'domain' | 'ipcidr'
  enabled: boolean
  intervalHours: number
}

/**
 * The proxy-action domain/ip-cidr presets, projected to the Android bypass-list
 * shape. These are exactly the lists whose matched domains should tunnel
 * (action 'proxy'); direct/reject presets and the urlless builtins are excluded.
 */
export function getBypassRuleListDefaults(): BypassRuleListDefault[] {
  return RULE_PROVIDER_PRESETS
    .filter((p) => p.action === 'proxy' && (p.type === 'domain-list' || p.type === 'ip-cidr-list') && !!p.url)
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      behavior: p.type === 'ip-cidr-list' ? 'ipcidr' : 'domain',
      enabled: p.enabled,
      intervalHours: 24,
    }))
}

function isGithub(url: string): boolean {
  return url.includes('github.com') || url.includes('raw.githubusercontent.com')
}

export function makeProvider(input: RuleProviderAddInput, id: string, customCount: number): RuleProvider {
  return {
    id,
    name: input.name,
    enabled: true,
    kind: isGithub(input.url) ? 'github' : 'url',
    url: input.url,
    type: input.type,
    action: input.action,
    priority: 1000 + customCount * 10,
    ...(input.category ? { category: input.category } : {}),
  }
}

export function addProvider(
  providers: readonly RuleProvider[],
  input: RuleProviderAddInput,
  id: string,
): { providers: RuleProvider[]; added: RuleProvider } {
  const customCount = providers.filter((p) => !p.isPreset).length
  const added = makeProvider(input, id, customCount)
  return { providers: [...providers, added], added }
}

export function removeProvider(providers: readonly RuleProvider[], id: string): RuleProvider[] {
  const target = providers.find((p) => p.id === id)
  if (target?.isPreset) throw new Error('Cannot remove built-in rule provider')
  return providers.filter((p) => p.id !== id)
}

export function updateProvider(
  providers: readonly RuleProvider[],
  id: string,
  patch: Partial<Pick<RuleProvider, 'enabled' | 'action' | 'priority'>>,
): { providers: RuleProvider[]; updated: RuleProvider } {
  const idx = providers.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`Rule provider not found: ${id}`)
  const updated: RuleProvider = { ...providers[idx]!, ...patch }
  const next = [...providers]
  next[idx] = updated
  return { providers: next, updated }
}

export function reorderProviders(providers: readonly RuleProvider[], ids: readonly string[]): RuleProvider[] {
  const byId = new Map(providers.map((p) => [p.id, p]))
  return ids.map((id, i) => {
    const p = byId.get(id)
    if (!p) throw new Error(`Unknown provider id: ${id}`)
    return { ...p, priority: (i + 1) * 10 }
  })
}
