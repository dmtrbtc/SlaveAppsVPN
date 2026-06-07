// Plugin API mirrors a subset of apps/windows/src/shared/ipc/types.ts.
// Keep these types **structurally compatible** with the Windows IPC types
// so the renderer doesn't need to branch by platform.

import type { VPNStatus, VPNMode, TrafficStats } from '@slave-vpn/shared'

// ─── VPN control ──────────────────────────────────────────────────────────────

export interface SlaveVpnConnectOptions {
  // sing-box JSON compiled by the renderer. Required — the native plugin
  // rejects with NO_CONFIG when missing.
  config: string
  // Optional metadata (kept for future use / logs)
  subscriptionId?: string
  selectedProxy?: string
  vpnMode?: VPNMode
}

export interface SlaveVpnStatusResult {
  status: VPNStatus
}

export interface SlaveVpnTrafficResult {
  traffic: TrafficStats
}

// ─── Subscriptions (mirrors Windows IPC) ─────────────────────────────────────

export interface SubscriptionEntry {
  id: string
  name: string
  type: 'subscription-url' | 'single-proxy' | 'remnawave-key' | 'provider'
  enabled: boolean
  autoUpdateMinutes: 0 | 15 | 60 | 360 | 1440
  addedAt: number
  lastFetchedAt: number | null
  lastError: string | null
  nodeCount: number | null
  urlDomain?: string
  proxyProtocol?: string
}

export interface SubscriptionAddOptions {
  name?: string
  type: SubscriptionEntry['type']
  input: string
  autoUpdateMinutes?: SubscriptionEntry['autoUpdateMinutes']
}

// ─── Permission flow ─────────────────────────────────────────────────────────

export interface VpnPermissionStatus {
  granted: boolean
  // When false, the user needs to confirm Android's VPN consent dialog.
}

// ─── Plugin interface ─────────────────────────────────────────────────────────

export interface SlaveVpnPluginInterface {
  // Permission
  checkPermission(): Promise<VpnPermissionStatus>
  requestPermission(): Promise<VpnPermissionStatus>

  // VPN control
  connect(options?: SlaveVpnConnectOptions): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<SlaveVpnStatusResult>
  getTraffic(): Promise<SlaveVpnTrafficResult>
  setMode(options: { mode: VPNMode }): Promise<void>

  // Subscriptions
  listSubscriptions(): Promise<{ entries: SubscriptionEntry[] }>
  addSubscription(options: SubscriptionAddOptions): Promise<{ entry: SubscriptionEntry }>
  removeSubscription(options: { id: string }): Promise<void>
  refreshSubscription(options: { id: string }): Promise<{ entry: SubscriptionEntry }>

  // Logs / diagnostics
  getLogs(options?: { tail?: number }): Promise<{ lines: string[] }>

  // Engine selection
  setEngine(options: { engine: 'mihomo' | 'singbox' }): Promise<void>

  // Event listeners (Capacitor's addListener interface)
  addListener(
    eventName: 'statusChanged',
    listener: (status: VPNStatus) => void,
  ): Promise<{ remove: () => Promise<void> }>

  addListener(
    eventName: 'trafficUpdate',
    listener: (stats: TrafficStats) => void,
  ): Promise<{ remove: () => Promise<void> }>

  removeAllListeners(): Promise<void>
}
