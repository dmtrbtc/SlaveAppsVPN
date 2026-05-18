import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] Loading — contextBridge available:', typeof contextBridge !== 'undefined')
import { IpcChannel } from '../shared/ipc/channels'
import type {
  SlaveVPNBridge,
  LoginEmailPayload,
  LoginTelegramPayload,
  VpnSetModePayload,
  RemoveDevicePayload,
  AppSettings,
  UpdateAvailablePayload,
  UpdateProgressPayload,
  UpdateSetChannelPayload,
  NotificationPayload,
  VpnHealthPayload,
  RuntimeEvent,
  ConfigSourceSetPayload,
  ConfigSourceValidatePayload,
} from '../shared/ipc/types'
// SafeMode types are embedded directly via bridge type
import type { VPNStatus, TrafficStats, Subscription } from '@slave-vpn/shared'

function invoke<T>(channel: string, data?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, data) as Promise<T>
}

function on<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: SlaveVPNBridge = {
  auth: {
    loginEmail: (payload: LoginEmailPayload) =>
      invoke(IpcChannel.AUTH_LOGIN_EMAIL, payload),

    loginTelegram: (payload: LoginTelegramPayload) =>
      invoke(IpcChannel.AUTH_LOGIN_TELEGRAM, payload),

    logout: () =>
      invoke(IpcChannel.AUTH_LOGOUT),

    getMe: () =>
      invoke(IpcChannel.AUTH_ME),

    refresh: () =>
      invoke(IpcChannel.AUTH_REFRESH),
  },

  vpn: {
    connect: () =>
      invoke(IpcChannel.VPN_CONNECT),

    disconnect: () =>
      invoke(IpcChannel.VPN_DISCONNECT),

    getStatus: () =>
      invoke(IpcChannel.VPN_GET_STATUS),

    setMode: (payload: VpnSetModePayload) =>
      invoke(IpcChannel.VPN_SET_MODE, payload),

    getConnectivity: () =>
      invoke(IpcChannel.VPN_GET_CONNECTIVITY),
  },

  subscription: {
    get: () =>
      invoke(IpcChannel.SUBSCRIPTION_GET),

    refresh: () =>
      invoke(IpcChannel.SUBSCRIPTION_REFRESH),

    getDevices: () =>
      invoke(IpcChannel.SUBSCRIPTION_GET_DEVICES),

    removeDevice: (payload: RemoveDevicePayload) =>
      invoke(IpcChannel.SUBSCRIPTION_REMOVE_DEVICE, payload),
  },

  settings: {
    get: () =>
      invoke(IpcChannel.SETTINGS_GET),

    set: (settings: Partial<AppSettings>) =>
      invoke(IpcChannel.SETTINGS_SET, settings),
  },

  diagnostics: {
    collect: () =>
      invoke(IpcChannel.DIAGNOSTICS_COLLECT),

    exportLogs: () =>
      invoke(IpcChannel.DIAGNOSTICS_EXPORT_LOGS),

    getLogs: () =>
      invoke(IpcChannel.DIAGNOSTICS_GET_LOGS),
  },

  provider: {
    getManifest: () =>
      invoke(IpcChannel.PROVIDER_GET_MANIFEST),

    getCapabilities: () =>
      invoke(IpcChannel.PROVIDER_GET_CAPABILITIES),
  },

  configSource: {
    getMeta: () =>
      invoke(IpcChannel.CONFIG_SOURCE_GET_META),

    set: (payload: ConfigSourceSetPayload) =>
      invoke(IpcChannel.CONFIG_SOURCE_SET, payload),

    validate: (payload: ConfigSourceValidatePayload) =>
      invoke(IpcChannel.CONFIG_SOURCE_VALIDATE, payload),

    clear: () =>
      invoke(IpcChannel.CONFIG_SOURCE_CLEAR),
  },

  servers: {
    list: () =>
      invoke(IpcChannel.SERVERS_LIST),
  },

  safeMode: {
    getStatus: () =>
      invoke(IpcChannel.SAFE_MODE_GET_STATUS),

    reset: () =>
      invoke(IpcChannel.SAFE_MODE_RESET),
  },

  update: {
    check: () =>
      invoke(IpcChannel.UPDATE_CHECK),

    download: () =>
      invoke(IpcChannel.UPDATE_DOWNLOAD),

    install: () =>
      invoke(IpcChannel.UPDATE_INSTALL),

    getStatus: () =>
      invoke(IpcChannel.UPDATE_GET_STATUS),

    setChannel: (payload: UpdateSetChannelPayload) =>
      invoke(IpcChannel.UPDATE_SET_CHANNEL, payload),
  },

  controls: {
    minimize: () =>
      invoke(IpcChannel.WINDOW_MINIMIZE),

    maximize: () =>
      invoke(IpcChannel.WINDOW_MAXIMIZE),

    close: () =>
      invoke(IpcChannel.WINDOW_CLOSE),
  },

  events: {
    onVpnStatus: (callback: (status: VPNStatus) => void) =>
      on<VPNStatus>(IpcChannel.EVENT_VPN_STATUS, callback),

    onVpnTraffic: (callback: (stats: TrafficStats) => void) =>
      on<TrafficStats>(IpcChannel.EVENT_VPN_TRAFFIC, callback),

    onVpnError: (callback: (error: { code: string; message: string }) => void) =>
      on(IpcChannel.EVENT_VPN_ERROR, callback),

    onVpnHealth: (callback: (health: VpnHealthPayload) => void) =>
      on<VpnHealthPayload>(IpcChannel.EVENT_VPN_HEALTH, callback),

    onRuntimeEvent: (callback: (event: RuntimeEvent) => void) =>
      on<RuntimeEvent>(IpcChannel.EVENT_RUNTIME_EVENT, callback),

    onSubscriptionUpdated: (callback: (sub: Subscription) => void) =>
      on<Subscription>(IpcChannel.EVENT_SUBSCRIPTION_UPDATED, callback),

    onAuthExpired: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IpcChannel.EVENT_AUTH_EXPIRED, listener)
      return () => ipcRenderer.removeListener(IpcChannel.EVENT_AUTH_EXPIRED, listener)
    },

    onUpdateAvailable: (callback: (payload: UpdateAvailablePayload) => void) =>
      on<UpdateAvailablePayload>(IpcChannel.EVENT_UPDATE_AVAILABLE, callback),

    onUpdateDownloaded: (callback: (payload: UpdateAvailablePayload) => void) =>
      on<UpdateAvailablePayload>(IpcChannel.EVENT_UPDATE_DOWNLOADED, callback),

    onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void) =>
      on<UpdateProgressPayload>(IpcChannel.EVENT_UPDATE_PROGRESS, callback),

    onNotification: (callback: (payload: NotificationPayload) => void) =>
      on<NotificationPayload>(IpcChannel.EVENT_NOTIFICATION, callback),
  },
}

try {
  contextBridge.exposeInMainWorld('slaveVPN', bridge)
  console.log('[preload] Bridge exposed successfully')
} catch (err) {
  console.error('[preload] Failed to expose bridge:', err)
}
