import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule, RuleAction } from '../models/RoutingRule'
import type { GeoRule } from '../models/GeoRule'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'

export interface CustomPolicyConfig {
  defaultAction: RuleAction
  processRules?: readonly RoutingRule[]
  userRules?: readonly RoutingRule[]
  providerRules?: readonly RoutingRule[]
  geoRules?: readonly GeoRule[]
  includePrivateDirect?: boolean
}

export function createCustomPolicy(config: CustomPolicyConfig): RoutingPolicy {
  const baseUserRules = config.includePrivateDirect !== false ? RUSSIA_BYPASS_PRIVATE_DIRECT : []
  return {
    mode: 'custom',
    defaultAction: config.defaultAction,
    processRules: config.processRules ?? [],
    userRules: [...baseUserRules, ...(config.userRules ?? [])],
    providerRules: config.providerRules ?? [],
    geoRules: config.geoRules ?? [],
  }
}
