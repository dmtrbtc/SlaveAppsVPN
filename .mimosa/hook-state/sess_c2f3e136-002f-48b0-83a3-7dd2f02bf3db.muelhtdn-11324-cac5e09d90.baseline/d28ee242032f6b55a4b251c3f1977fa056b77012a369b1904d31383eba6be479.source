import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule } from '../models/RoutingRule'
import type { SplitTunnelRule } from '../models/SplitTunnelTarget'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'

export function createSplitPolicy(splitRules: readonly SplitTunnelRule[]): RoutingPolicy {
  const processRules: RoutingRule[] = splitRules.map(sr => ({
    id: `split:${sr.target.platform}:${sr.target.identifier}`,
    target: { type: 'process_name', value: sr.target.identifier },
    action: sr.action,
    priority: sr.priority,
    source: { provider: 'split-tunnel', category: sr.target.displayName },
  }))

  return {
    mode: 'split',
    defaultAction: 'direct',
    processRules,
    userRules: RUSSIA_BYPASS_PRIVATE_DIRECT,
    providerRules: [],
    geoRules: [],
  }
}
