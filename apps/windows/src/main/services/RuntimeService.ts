import type { VPNStatus, VPNMode } from '@slave-vpn/shared'
import type { VPNConnectivityInfo, ProxyEntry, ActiveConnectionsSnapshot } from '../../shared/ipc/types'
import type { ConfigUpdateReason } from './impl/RuntimeServiceImpl'

export interface RuntimeService {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): VPNStatus
  getState(): string
  setMode(mode: VPNMode): Promise<void>
  getEngineVersion(): string | null
  getConnectivity(): Promise<VPNConnectivityInfo | null>
  probeProxyLatency(tag: string, testUrl: string, timeoutMs: number): Promise<number | null>
  setSelectedProxy(proxyName: string): Promise<void>
  getProxyList(): Promise<ProxyEntry[]>
  getConnections(): Promise<ActiveConnectionsSnapshot | null>
  closeConnection(id: string): Promise<void>
  notifySubscriptionsChanged(reason?: ConfigUpdateReason): Promise<void>
  dispose(): Promise<void>
}
