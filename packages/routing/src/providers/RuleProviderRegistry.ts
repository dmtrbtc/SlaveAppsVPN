import type { RuleProvider } from './RuleProvider'
import type { RoutingRule } from '../models/RoutingRule'

export class RuleProviderRegistry {
  private readonly providers = new Map<string, RuleProvider>()

  register(provider: RuleProvider): void {
    this.providers.set(provider.metadata.id, provider)
  }

  unregister(id: string): void {
    this.providers.delete(id)
  }

  getProvider(id: string): RuleProvider | undefined {
    return this.providers.get(id)
  }

  getAll(): readonly RuleProvider[] {
    return [...this.providers.values()]
  }

  async loadAll(): Promise<readonly RoutingRule[]> {
    const results = await Promise.allSettled(
      [...this.providers.values()].map(p => p.load())
    )
    const rules: RoutingRule[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        rules.push(...result.value)
      }
    }
    return rules
  }

  async loadProvider(id: string): Promise<readonly RoutingRule[]> {
    const provider = this.providers.get(id)
    if (!provider) throw new Error(`RuleProvider not found: ${id}`)
    return provider.load()
  }
}
