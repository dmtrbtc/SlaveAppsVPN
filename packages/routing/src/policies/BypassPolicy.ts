import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule } from '../models/RoutingRule'
import { RUSSIA_BYPASS_RULES, RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'

export function createBypassPolicy(extraBlockedRules?: readonly RoutingRule[]): RoutingPolicy {
  return {
    mode: 'bypass',
    defaultAction: 'direct',
    processRules: [],
    userRules: RUSSIA_BYPASS_PRIVATE_DIRECT,
    providerRules: [
      ...RUSSIA_BYPASS_RULES,
      ...(extraBlockedRules ?? []),
    ],
    geoRules: [],
  }
}
