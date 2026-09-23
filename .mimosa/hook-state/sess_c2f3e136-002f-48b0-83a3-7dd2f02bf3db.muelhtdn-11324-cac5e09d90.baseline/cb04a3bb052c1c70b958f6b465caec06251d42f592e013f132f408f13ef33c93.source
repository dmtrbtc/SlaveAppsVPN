import {
  addProvider,
  mergeWithPresets,
  removeProvider,
  sortByPriority,
  updateProvider,
  type AndroidRuleListInput,
  type AppSettings,
  type RuleProvider,
} from '@slave-vpn/core'
import { androidSettings, patchAndroidSettings } from './settings-store'

function supportsAndroidRuleList(provider: RuleProvider): boolean {
  return provider.action === 'proxy' &&
    (provider.type === 'domain-list' || provider.type === 'ip-cidr-list') &&
    provider.url.length > 0
}

/** Merge new presets without replacing stored Android preset toggles. */
export function selectAndroidRuleProviders(settings: Pick<AppSettings, 'ruleProviders'>): RuleProvider[] {
  return sortByPriority(mergeWithPresets(settings.ruleProviders).filter(supportsAndroidRuleList))
}

export function toAndroidRuleLists(providers: readonly RuleProvider[]): AndroidRuleListInput[] {
  return providers.filter(supportsAndroidRuleList).map((provider) => ({
    id: provider.id,
    url: provider.url,
    behavior: provider.type === 'ip-cidr-list' ? 'ipcidr' : 'domain',
    enabled: provider.enabled,
    intervalHours:
      typeof provider.intervalHours === 'number' && provider.intervalHours > 0
        ? provider.intervalHours
        : 24,
  }))
}

export function listAndroidRuleProviders(): RuleProvider[] {
  return selectAndroidRuleProviders(androidSettings())
}

export function getAndroidRuleLists(): AndroidRuleListInput[] {
  return toAndroidRuleLists(listAndroidRuleProviders())
}

function randomId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${slug || 'list'}-${suffix}`
}

export async function addAndroidRuleProvider(input: {
  name: string
  url: string
  type?: string
}): Promise<RuleProvider> {
  const url = input.url.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('URL должен начинаться с http(s)://')
  const providers = listAndroidRuleProviders()
  if (providers.some((provider) => provider.url === url)) throw new Error('Такой список уже добавлен')
  const name = input.name.trim() || url.split('/').pop() || 'Список'
  const { providers: next, added } = addProvider(providers, {
    name,
    url,
    type: input.type === 'ip-cidr-list' ? 'ip-cidr-list' : 'domain-list',
    action: 'proxy',
    category: 'russia-bypass',
  }, randomId(name))
  await patchAndroidSettings({ ruleProviders: next })
  return added
}

export async function removeAndroidRuleProvider(id: string): Promise<void> {
  const next = removeProvider(listAndroidRuleProviders(), id)
  await patchAndroidSettings({ ruleProviders: next })
}

export async function updateAndroidRuleProvider(
  id: string,
  patch: Partial<Pick<RuleProvider, 'enabled' | 'action' | 'priority'>>,
): Promise<RuleProvider> {
  const { providers, updated } = updateProvider(listAndroidRuleProviders(), id, patch)
  await patchAndroidSettings({ ruleProviders: providers })
  return updated
}
