import type { RoutingRule } from '../models/RoutingRule'
import type { RoutingPolicy, NormalizedPolicy } from '../models/RoutingPolicy'
import type { GeoRule } from '../models/GeoRule'

export class PolicyNormalizer {
  normalize(policy: RoutingPolicy): NormalizedPolicy {
    const geoAsRules = policy.geoRules.map(geoRuleToRoutingRule)
    const allRules: RoutingRule[] = [
      ...policy.processRules,
      ...policy.userRules,
      ...policy.providerRules,
      ...geoAsRules,
    ]
    const sorted = [...allRules].sort((a, b) => a.priority - b.priority)
    return {
      mode: policy.mode,
      defaultAction: policy.defaultAction,
      rules: sorted,
    }
  }
}

function geoRuleToRoutingRule(geo: GeoRule): RoutingRule {
  return {
    id: geo.id,
    target: { type: geo.category, value: geo.code },
    action: geo.action,
    priority: geo.priority,
    source: geo.source,
    noResolve: geo.noResolve,
  }
}
