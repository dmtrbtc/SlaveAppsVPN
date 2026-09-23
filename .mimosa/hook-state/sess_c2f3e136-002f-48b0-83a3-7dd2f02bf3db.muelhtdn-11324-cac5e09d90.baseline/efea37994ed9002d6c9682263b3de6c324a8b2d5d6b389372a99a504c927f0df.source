export type RuleTargetType =
  | 'domain'
  | 'domain_suffix'
  | 'domain_keyword'
  | 'ip_cidr'
  | 'geoip'
  | 'geosite'
  | 'process_name'
  | 'port'

export type RuleAction = 'proxy' | 'direct' | 'reject'

export interface RuleTarget {
  readonly type: RuleTargetType
  readonly value: string
}

export interface RuleSource {
  readonly provider?: string
  readonly category?: string
  readonly originalRule?: string
}

export interface RoutingRule {
  readonly id: string
  readonly target: RuleTarget
  readonly action: RuleAction
  readonly priority: number
  readonly source?: RuleSource
  readonly noResolve?: boolean
}
