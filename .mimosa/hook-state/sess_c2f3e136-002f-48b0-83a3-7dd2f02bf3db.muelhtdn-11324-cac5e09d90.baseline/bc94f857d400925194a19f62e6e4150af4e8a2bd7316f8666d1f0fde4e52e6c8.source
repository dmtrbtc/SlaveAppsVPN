export type BalancerMode = 'latency' | 'stability' | 'balanced' | 'manual'

export interface NodeScore {
  name: string
  latencyMs: number | null
  jitterMs: number
  packetLoss: number
  stabilityScore: number
  compositeScore: number
  probeCount: number
  lastProbeAt: number | null
  quarantined: boolean
}

export interface BalancerState {
  enabled: boolean
  mode: BalancerMode
  currentBest: string | null
  lastRebalanceAt: number | null
  probeIntervalMs: number
  nodes: NodeScore[]
}
