import type { VPNStatus, VPNMode } from '@slave-vpn/shared'

export interface RuntimeService {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): VPNStatus
  setMode(mode: VPNMode): Promise<void>
  getEngineVersion(): string | null
  dispose(): Promise<void>
}
