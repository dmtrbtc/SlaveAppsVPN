import type { RuleAction, RoutingRule } from './RoutingRule'
import type { GeoRule } from './GeoRule'

export type RoutingMode = 'full' | 'bypass' | 'split' | 'custom'

export interface RoutingPolicy {
  readonly mode: RoutingMode
  readonly defaultAction: RuleAction
  readonly processRules: readonly RoutingRule[]
  readonly userRules: readonly RoutingRule[]
  readonly providerRules: readonly RoutingRule[]
  readonly geoRules: readonly GeoRule[]
}

export interface NormalizedPolicy {
  readonly mode: RoutingMode
  readonly defaultAction: RuleAction
  readonly rules: readonly RoutingRule[]
}

export function emptyPolicy(mode: RoutingMode, defaultAction: RuleAction): RoutingPolicy {
  return {
    mode,
    defaultAction,
    processRules: [],
    userRules: [],
    providerRules: [],
    geoRules: [],
  }
}
