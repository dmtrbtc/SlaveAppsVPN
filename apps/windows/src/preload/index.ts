import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../shared/ipc/channels'
import type {
  SlaveVPNBridge,
  LoginEmailPayload,
  LoginTelegramPayload,
  VpnSetModePayload,
  RemoveDevicePayload,
  AppSettings,
  UpdateAvailablePayload,
  NotificationPayload,
} from '../shared/ipc/types'
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

  events: {
    onVpnStatus: (callback: (status: VPNStatus) => void) =>
      on<VPNStatus>(IpcChannel.EVENT_VPN_STATUS, callback),

    onVpnTraffic: (callback: (stats: TrafficStats) => void) =>
      on<TrafficStats>(IpcChannel.EVENT_VPN_TRAFFIC, callback),

    onVpnError: (callback: (error: { code: string; message: string }) => void) =>
      on(IpcChannel.EVENT_VPN_ERROR, callback),

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

    onNotification: (callback: (payload: NotificationPayload) => void) =>
      on<NotificationPayload>(IpcChannel.EVENT_NOTIFICATION, callback),
  },
}

contextBridge.exposeInMainWorld('slaveVPN', bridge)
