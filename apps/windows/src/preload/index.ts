import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] Loading — contextBridge available:', typeof contextBridge !== 'undefined')
import { IpcChannel } from '../shared/ipc/channels'
import type {
  SlaveVPNBridge,
  LoginEmailPayload,
  LoginTelegramPayload,
  VpnSetModePayload,
  VpnSetProxyPayload,
  BalancerSetEnabledPayload,
  BalancerSetModePayload,
  BalancerState,
  DnsSetProfilePayload,
  RuleProviderAddPayload,
  RuleProviderRemovePayload,
  RuleProviderUpdatePayload,
  RuleProviderReorderPayload,
  SplitSetProcessListPayload,
  RoutingSetEnabledScenariosPayload,
  SubscriptionAddPayload,
  SubscriptionRemovePayload,
  SubscriptionUpdatePayload,
  SubscriptionRefreshPayload,
  SubscriptionEntry,
  ConnectionCloseRequest,
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
  ServerLatencyPayload,
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

    setProxy: (payload: VpnSetProxyPayload) =>
      invoke(IpcChannel.VPN_SET_PROXY, payload),

    getProxyList: () =>
      invoke(IpcChannel.VPN_GET_PROXY_LIST),

    getConnections: () =>
      invoke(IpcChannel.VPN_GET_CONNECTIONS),

    closeConnection: (payload: ConnectionCloseRequest) =>
      invoke(IpcChannel.VPN_CLOSE_CONNECTION, payload),

    getBalancerState: () =>
      invoke(IpcChannel.VPN_GET_BALANCER_STATE),

    setBalancerEnabled: (payload: BalancerSetEnabledPayload) =>
      invoke(IpcChannel.VPN_SET_BALANCER_ENABLED, payload),

    setBalancerMode: (payload: BalancerSetModePayload) =>
      invoke(IpcChannel.VPN_SET_BALANCER_MODE, payload),

    probeAll: () =>
      invoke(IpcChannel.VPN_PROBE_ALL),
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

    getStartup: () =>
      invoke(IpcChannel.DIAGNOSTICS_GET_STARTUP),
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

    probe: () =>
      invoke(IpcChannel.SERVERS_PROBE),
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

  runtime: {
    restart: () =>
      invoke(IpcChannel.RUNTIME_RESTART),
  },

  cache: {
    clear: () =>
      invoke(IpcChannel.CACHE_CLEAR),
  },

  dns: {
    getProfile: () =>
      invoke(IpcChannel.DNS_GET_PROFILE),

    setProfile: (payload: DnsSetProfilePayload) =>
      invoke(IpcChannel.DNS_SET_PROFILE, payload),

    getPresets: () =>
      invoke(IpcChannel.DNS_GET_PRESETS),

    getStrategies: () =>
      invoke(IpcChannel.DNS_GET_STRATEGIES),

    leakTest: () =>
      invoke(IpcChannel.DNS_LEAK_TEST),
  },

  rules: {
    list: () =>
      invoke(IpcChannel.RULES_LIST),

    add: (payload: RuleProviderAddPayload) =>
      invoke(IpcChannel.RULES_ADD, payload),

    remove: (payload: RuleProviderRemovePayload) =>
      invoke(IpcChannel.RULES_REMOVE, payload),

    update: (payload: RuleProviderUpdatePayload) =>
      invoke(IpcChannel.RULES_UPDATE, payload),

    reorder: (payload: RuleProviderReorderPayload) =>
      invoke(IpcChannel.RULES_REORDER, payload),

    reload: () =>
      invoke(IpcChannel.RULES_RELOAD),
  },

  split: {
    getProcesses: () =>
      invoke(IpcChannel.SPLIT_GET_PROCESSES),

    getProcessList: () =>
      invoke(IpcChannel.SPLIT_GET_PROCESS_LIST),

    setProcessList: (payload: SplitSetProcessListPayload) =>
      invoke(IpcChannel.SPLIT_SET_PROCESS_LIST, payload),
  },

  routing: {
    listScenarios: () =>
      invoke(IpcChannel.ROUTING_LIST_SCENARIOS),

    setEnabledScenarios: (payload: RoutingSetEnabledScenariosPayload) =>
      invoke(IpcChannel.ROUTING_SET_ENABLED_SCENARIOS, payload),
  },

  subscriptions: {
    list: () =>
      invoke(IpcChannel.SUBSCRIPTIONS_LIST),

    add: (payload: SubscriptionAddPayload) =>
      invoke(IpcChannel.SUBSCRIPTIONS_ADD, payload),

    remove: (payload: SubscriptionRemovePayload) =>
      invoke(IpcChannel.SUBSCRIPTIONS_REMOVE, payload),

    update: (payload: SubscriptionUpdatePayload) =>
      invoke(IpcChannel.SUBSCRIPTIONS_UPDATE, payload),

    refresh: (payload: SubscriptionRefreshPayload) =>
      invoke(IpcChannel.SUBSCRIPTIONS_REFRESH, payload),

    refreshAll: () =>
      invoke(IpcChannel.SUBSCRIPTIONS_REFRESH_ALL),

    detectClipboard: () =>
      invoke(IpcChannel.SUBSCRIPTIONS_DETECT_CLIPBOARD),
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

    onServerLatency: (callback: (payload: ServerLatencyPayload) => void) =>
      on<ServerLatencyPayload>(IpcChannel.EVENT_SERVER_LATENCY, callback),

    onBalancerState: (callback: (state: BalancerState) => void) =>
      on<BalancerState>(IpcChannel.EVENT_BALANCER_STATE, callback),

    onProxyChanged: (callback: (proxyName: string) => void) =>
      on<string>(IpcChannel.EVENT_PROXY_CHANGED, callback),

    onSubscriptionsChanged: (callback: (entries: SubscriptionEntry[]) => void) =>
      on<SubscriptionEntry[]>(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, callback),
  },
}

try {
  contextBridge.exposeInMainWorld('slaveVPN', bridge)
  console.log('[preload] Bridge exposed successfully')
} catch (err) {
  console.error('[preload] Failed to expose bridge:', err)
}
