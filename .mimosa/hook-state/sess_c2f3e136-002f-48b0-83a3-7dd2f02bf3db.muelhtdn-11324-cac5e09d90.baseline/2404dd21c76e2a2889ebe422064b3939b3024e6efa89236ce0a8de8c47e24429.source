import type { RoutingRule } from '../models/RoutingRule'

export type RuleProviderType = 'bundled' | 'remote' | 'cache'

export interface RuleProviderMetadata {
  readonly id: string
  readonly name: string
  readonly type: RuleProviderType
  readonly version?: string
  readonly updatedAt?: Date
  readonly checksum?: string
  readonly ruleCount: number
}

export interface RuleProvider {
  readonly metadata: RuleProviderMetadata
  load(): Promise<readonly RoutingRule[]>
  isAvailable(): boolean
}
