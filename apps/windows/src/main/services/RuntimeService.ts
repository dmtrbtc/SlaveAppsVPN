import type { VPNStatus, VPNMode } from '@slave-vpn/shared'
import type { VPNConnectivityInfo } from '../../shared/ipc/types'

export interface RuntimeService {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): VPNStatus
  getState(): string
  setMode(mode: VPNMode): Promise<void>
  getEngineVersion(): string | null
  getConnectivity(): Promise<VPNConnectivityInfo | null>
  probeProxyLatency(tag: string, testUrl: string, timeoutMs: number): Promise<number | null>
  dispose(): Promise<void>
}
