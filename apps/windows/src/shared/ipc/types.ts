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
  events: {
    onVpnStatus: (callback: (status: VPNStatus) => void) => () => void
    onVpnTraffic: (callback: (stats: TrafficStats) => void) => () => void
    onVpnError: (callback: (error: { code: string; message: string }) => void) => () => void
    onSubscriptionUpdated: (callback: (sub: Subscription) => void) => () => void
    onAuthExpired: (callback: () => void) => () => void
    onUpdateAvailable: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onUpdateDownloaded: (callback: (payload: UpdateAvailablePayload) => void) => () => void
    onNotification: (callback: (payload: NotificationPayload) => void) => () => void
  }
}
