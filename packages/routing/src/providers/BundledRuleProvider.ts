import type { RuleProvider, RuleProviderMetadata } from './RuleProvider'
import type { RoutingRule } from '../models/RoutingRule'

export class BundledRuleProvider implements RuleProvider {
  readonly metadata: RuleProviderMetadata

  constructor(
    id: string,
    name: string,
    private readonly rules: readonly RoutingRule[],
    version?: string
  ) {
    this.metadata = {
      id,
      name,
      type: 'bundled',
      version,
      ruleCount: rules.length,
    }
  }

  async load(): Promise<readonly RoutingRule[]> {
    return this.rules
  }

  isAvailable(): boolean {
    return true
  }
}
