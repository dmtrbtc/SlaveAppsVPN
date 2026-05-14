import type { RuleAction, RuleSource } from './RoutingRule'

export type GeoCategory = 'geoip' | 'geosite'

export interface GeoRule {
  readonly id: string
  readonly category: GeoCategory
  readonly code: string
  readonly action: RuleAction
  readonly priority: number
  readonly source?: RuleSource
  readonly noResolve?: boolean
}
