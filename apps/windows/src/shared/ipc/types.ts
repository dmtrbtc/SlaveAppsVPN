import type {
  AuthTokens,
  User,
  Subscription,
  Device,
  VPNStatus,
  VPNMode,
  TrafficStats,
} from '@slave-vpn/shared'

// ─── Result envelope ──────────────────────────────────────────────────────────

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: { code: string; message: string } }
export type IpcResult<T> = IpcOk<T> | IpcErr

export function okResult<T>(data: T): IpcOk<T> {
  return { ok: true, data }
}

export function errResult(code: string, message: string): IpcErr {
  return { ok: false, error: { code, message } }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginEmailPayload {
  email: string
  password: string
}

export interface LoginTelegramPayload {
  initData: string
}

export type AuthLoginResult = IpcResult<AuthTokens>
export type AuthMeResult = IpcResult<User>
export type AuthLogoutResult = IpcResult<void>

// ─── VPN ─────────────────────────────────────────────────────────────────────

export interface VpnSetModePayload {
  mode: VPNMode
}

export type VpnConnectResult = IpcResult<void>
export type VpnDisconnectResult = IpcResult<void>
export type VpnGetStatusResult = IpcResult<VPNStatus>

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface RemoveDevicePayload {
  hwid: string
}

export type SubscriptionGetResult = IpcResult<Subscription>
export type SubscriptionGetDevicesResult = IpcResult<Device[]>
export type SubscriptionRemoveDeviceResult = IpcResult<void>

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  language: 'ru' | 'en'
  vpnMode: VPNMode
  autoStart: boolean
  minimizeToTray: boolean
  notificationsEnabled: boolean
  autoConnect: boolean
  killSwitch: boolean
  apiBaseUrl: string
  telegramBotUsername: string
  devMode: boolean
}

export type SettingsGetResult = IpcResult<AppSettings>
export type SettingsSetResult = IpcResult<void>

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface SystemInfo {
  platform: string
  arch: string
  osVersion: string
  appVersion: string
  mihomoVersion: string | null
  totalMemoryMb: number
  freeMemoryMb: number
  uptime: number
}

export interface LogEntry {
  level: string
  time: number
  msg: string
  [key: string]: unknown
}

export type DiagnosticsCollectResult = IpcResult<SystemInfo>
export type DiagnosticsExportLogsResult = IpcResult<string>
export type DiagnosticsGetLogsResult = IpcResult<LogEntry[]>

// ─── Provider ─────────────────────────────────────────────────────────────────

export type ProviderTier = 'community' | 'verified' | 'official'

export interface ProviderCapabilitiesPayload {
  telegramAuth: boolean
  emailAuth: boolean
  payments: boolean
  multiDevice: boolean
  serverSelection: boolean
  trialAvailable: boolean
}

export interface ProviderManifestPayload {
  id: string
  displayName: string
  description: string
  version: string
  tier: ProviderTier
  capabilities: ProviderCapabilitiesPayload
  logoUrl?: string
  website?: string
  support?: string
  telegram?: string
}

export type ProviderGetManifestResult = IpcResult<ProviderManifestPayload>
export type ProviderGetCapabilitiesResult = IpcResult<ProviderCapabilitiesPayload>

// ─── Health ───────────────────────────────────────────────────────────────────

export interface VpnHealthPayload {
  processAlive: boolean
  apiResponding: boolean
  connectivityOk: boolean
  dnsOk: boolean
  trafficActive: boolean
  tunAvailable: boolean
  checkedAt: number
}

// ─── Runtime Event Bus ────────────────────────────────────────────────────────
// Typed taxonomy for runtime events forwarded to the renderer.
// Severity drives notification level and log retention policy.

export type RuntimeEventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export type RuntimeEventKind =
  | 'vpn.state_changed'
  | 'vpn.connected'
  | 'vpn.disconnected'
  | 'vpn.error'
  | 'health.degraded'
  | 'health.recovered'
  | 'health.dns_failure'
  | 'health.tunnel_unstable'
  | 'health.offline'
  | 'reconnect.attempt'
  | 'reconnect.success'
  | 'reconnect.exhausted'
  | 'sleep.suspend'
  | 'sleep.resume'

export interface RuntimeEvent {
  id: string
  kind: RuntimeEventKind
  severity: RuntimeEventSeverity
  timestamp: number
  message: string
  metadata?: Record<string, unknown>
}

// ─── Events (main → renderer) ────────────────────────────────────────────────

export interface UpdateAvailablePayload {
  version: string
  releaseNotes: string | null
}

export interface NotificationPayload {
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
}

// ─── Feature Flags ────────────────────────────────────────────────────────────
// App-level feature flags — separate from provider capabilities.
// Provider capabilities gate business logic; feature flags gate app behavior.

export type AppFeatureFlag =
  | 'devMode'          // Exposes dev-only UI panels
  | 'diagnosticsExport'  // Export diagnostics bundle button
  | 'advancedRouting'  // Advanced routing rule editor (future)
  | 'splitTunneling'   // Split tunnel process selection (future)
  | 'killSwitch'       // Kill switch toggle

// ─── Bridge type (window.slaveVPN) ───────────────────────────────────────────

export interface SlaveVPNBridge {
  auth: {
    loginEmail: (payload: LoginEmailPayload) => Promise<AuthLoginResult>
    loginTelegram: (payload: LoginTelegramPayload) => Promise<AuthLoginResult>
    logout: () => Promise<AuthLogoutResult>
    getMe: () => Promise<AuthMeResult>
    refresh: () => Promise<AuthLoginResult>
  }
  vpn: {
    connect: () => Promise<VpnConnectResult>
    disconnect: () => Promise<VpnDisconnectResult>
    getStatus: () => Promise<VpnGetStatusResult>
    setMode: (payload: VpnSetModePayload) => Promise<IpcResult<void>>
  }
  subscription: {
    get: () => Promise<SubscriptionGetResult>
    refresh: () => Promise<SubscriptionGetResult>
    getDevices: () => Promise<SubscriptionGetDevicesResult>
    removeDevice: (payload: RemoveDevicePayload) => Promise<SubscriptionRemoveDeviceResult>
  }
  settings: {
    get: () => Promise<SettingsGetResult>
    set: (settings: Partial<AppSettings>) => Promise<SettingsSetResult>
  }
  diagnostics: {
    collect: () => Promise<DiagnosticsCollectResult>
    exportLogs: () => Promise<DiagnosticsExportLogsResult>
    getLogs: () => Promise<DiagnosticsGetLogsResult>
  }
  provider: {
    getManifest: () => Promise<ProviderGetManifestResult>
    getCapabilities: () => Promise<ProviderGetCapabilitiesResult>
  }
  events: {
    onVpnStatus: (callback: (status: VPNStatus) => void) => () => void
    onVpnTraffic: (callback: (stats: TrafficStats) => void) => () => void
    onVpnError: (callback: (error: { code: string; message: string }) => void) => () => void
    onVpnHealth: (callback: (health: VpnHealthPayload) => void) => () => void
    onRuntimeEvent: (callback: (event: RuntimeEvent) => void) => () => void
    onSubscriptionUpdated: (callback: (sub: Subscription) => void) => () => void
    onAuthExpired: (callback: () => void) => () => void
    onUpdateAvailable: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onUpdateDownloaded: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onNotification: (callback: (payload: NotificationPayload) => void) => () => void
  }
}
