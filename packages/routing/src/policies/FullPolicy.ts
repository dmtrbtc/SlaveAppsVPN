import type { RoutingPolicy } from '../models/RoutingPolicy'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'

export function createFullPolicy(): RoutingPolicy {
  return {
    mode: 'full',
    defaultAction: 'proxy',
    processRules: [],
    userRules: RUSSIA_BYPASS_PRIVATE_DIRECT,
    providerRules: [],
    geoRules: [],
  }
}
