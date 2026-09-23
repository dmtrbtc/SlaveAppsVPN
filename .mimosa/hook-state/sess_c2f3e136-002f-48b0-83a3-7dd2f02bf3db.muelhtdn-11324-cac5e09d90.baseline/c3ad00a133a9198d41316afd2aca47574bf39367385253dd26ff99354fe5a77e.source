import type { NormalizedPolicy } from '../models/RoutingPolicy'
import type { RoutingRule } from '../models/RoutingRule'

export class PolicyOptimizer {
  optimize(policy: NormalizedPolicy): NormalizedPolicy {
    let rules = [...policy.rules]
    rules = this.deduplicateExactRules(rules)
    rules = this.removeRedundantDomainRules(rules)
    return { ...policy, rules }
  }

  private deduplicateExactRules(rules: RoutingRule[]): RoutingRule[] {
    const seen = new Set<string>()
    return rules.filter(rule => {
      const key = `${rule.target.type}:${rule.target.value}:${rule.action}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private removeRedundantDomainRules(rules: RoutingRule[]): RoutingRule[] {
    const suffixActions = new Map<string, string>()
    for (const rule of rules) {
      if (rule.target.type === 'domain_suffix') {
        suffixActions.set(rule.target.value, `${rule.action}:${rule.priority}`)
      }
    }
    if (suffixActions.size === 0) return rules

    return rules.filter(rule => {
      if (rule.target.type !== 'domain') return true
      const domain = rule.target.value
      for (const [suffix, actionPriority] of suffixActions) {
        if (domain === suffix || domain.endsWith(`.${suffix}`)) {
          const [suffixAction, suffixPriorityStr] = actionPriority.split(':')
          const suffixPriority = Number(suffixPriorityStr)
          if (suffixAction === rule.action && suffixPriority <= rule.priority) {
            return false
          }
        }
      }
      return true
    })
  }
}
