import type { RuleAction } from './RoutingRule'

export type SplitTunnelPlatform = 'windows' | 'android' | 'ios' | 'macos' | 'linux'

export interface SplitTunnelTarget {
  readonly platform: SplitTunnelPlatform
  readonly identifier: string
  readonly displayName: string
  readonly metadata?: Readonly<Record<string, string>>
}

export interface SplitTunnelRule {
  readonly target: SplitTunnelTarget
  readonly action: RuleAction
  readonly priority: number
}
