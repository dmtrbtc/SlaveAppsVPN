import type {
  SlaveVPNBridge,
  UpdateSetChannelPayload,
  VpnSetProxyPayload,
  BalancerSetEnabledPayload,
  BalancerSetModePayload,
  DnsSetProfilePayload,
  RuleProviderAddPayload,
  RuleProviderRemovePayload,
  RuleProviderUpdatePayload,
  RuleProviderReorderPayload,
  SplitSetProcessListPayload,
  BalancerState,
  SubscriptionAddPayload,
  SubscriptionRemovePayload,
  SubscriptionUpdatePayload,
  SubscriptionRefreshPayload,
  ProfileCreateInput,
  ProfileApplyPayload,
} from '@shared/ipc/types'

const IPC_TIMEOUT_MS = 15_000
const NOOP_UNSUB = (): void => {}

function requireBridge(): SlaveVPNBridge {
  if (!window.slaveVPN) {
    const w = window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }
    const cap = w.Capacitor
    const hint = cap
      ? `Capacitor detected (platform=${cap.getPlatform?.() ?? '?'} native=${cap.isNativePlatform?.() ?? '?'}) but bridge didn't install — check console for [android-bridge] errors`
      : 'no preload bridge and no Capacitor global — this build is likely loaded in an unsupported shell'
    throw new Error(`[IPC] Bridge not available — ${hint}`)
  }
  return window.slaveVPN
}

function getBridge(): SlaveVPNBridge | null {
  return window.slaveVPN ?? null
}

async function unwrap<T>(
  promise: Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('[IPC] Request timed out')), IPC_TIMEOUT_MS)
  })
  try {
    const result = await Promise.race([promise, timeout])
    if (!result.ok) {
      const err = new Error(result.error.message)
      ;(err as Error & { code: string }).code = result.error.code
      throw err
    }
    return result.data
  } finally {
    clearTimeout(timer)
  }
}

export const authApi = {
  loginEmail: (email: string, password: string) =>
    unwrap(requireBridge().auth.loginEmail({ email, password })),
  loginTelegram: (initData: string) =>
    unwrap(requireBridge().auth.loginTelegram({ initData })),
  logout: () =>
    unwrap(requireBridge().auth.logout()),
  getMe: () =>
    unwrap(requireBridge().auth.getMe()),
  refresh: () =>
    unwrap(requireBridge().auth.refresh()),
}

export const cabinetApi = {
  getAuthState: () =>
    unwrap(requireBridge().cabinet.getAuthState()),
  requestDeepLink: () =>
    unwrap(requireBridge().cabinet.requestDeepLink()),
  pollDeepLink: (token: string) =>
    unwrap(requireBridge().cabinet.pollDeepLink({ token })),
  loginEmail: (email: string, password: string) =>
    unwrap(requireBridge().cabinet.loginEmail({ email, password })),
  getMe: () =>
    unwrap(requireBridge().cabinet.getMe()),
  getSubscription: () =>
    unwrap(requireBridge().cabinet.getSubscription()),
  importSubscription: () =>
    unwrap(requireBridge().cabinet.importSubscription()),
  logout: () =>
    unwrap(requireBridge().cabinet.logout()),
}

export const vpnApi = {
  connect: () =>
    unwrap(requireBridge().vpn.connect()),
  disconnect: () =>
    unwrap(requireBridge().vpn.disconnect()),
  getStatus: () =>
    unwrap(requireBridge().vpn.getStatus()),
  setMode: (mode: Parameters<SlaveVPNBridge['vpn']['setMode']>[0]['mode']) =>
    unwrap(requireBridge().vpn.setMode({ mode })),
  getConnectivity: () =>
    unwrap(requireBridge().vpn.getConnectivity()),
  setProxy: (payload: VpnSetProxyPayload) =>
    unwrap(requireBridge().vpn.setProxy(payload)),
  getProxyList: () =>
    unwrap(requireBridge().vpn.getProxyList()),
  getConnections: () =>
    unwrap(requireBridge().vpn.getConnections()),
  closeConnection: (id: string) =>
    unwrap(requireBridge().vpn.closeConnection({ id })),
  getBalancerState: () =>
    unwrap(requireBridge().vpn.getBalancerState()),
  setBalancerEnabled: (payload: BalancerSetEnabledPayload) =>
    unwrap(requireBridge().vpn.setBalancerEnabled(payload)),
  setBalancerMode: (payload: BalancerSetModePayload) =>
    unwrap(requireBridge().vpn.setBalancerMode(payload)),
  probeAll: () =>
    unwrap(requireBridge().vpn.probeAll()),
}

export const subscriptionApi = {
  get: () =>
    unwrap(requireBridge().subscription.get()),
  refresh: () =>
    unwrap(requireBridge().subscription.refresh()),
  getDevices: () =>
    unwrap(requireBridge().subscription.getDevices()),
  removeDevice: (hwid: string) =>
    unwrap(requireBridge().subscription.removeDevice({ hwid })),
}

export const settingsApi = {
  get: () =>
    unwrap(requireBridge().settings.get()),
  set: (partial: Parameters<SlaveVPNBridge['settings']['set']>[0]) =>
    unwrap(requireBridge().settings.set(partial)),
}

export const diagnosticsApi = {
  collect: () =>
    unwrap(requireBridge().diagnostics.collect()),
  getLogs: () =>
    unwrap(requireBridge().diagnostics.getLogs()),
  exportLogs: () =>
    unwrap(requireBridge().diagnostics.exportLogs()),
  getStartup: () =>
    unwrap(requireBridge().diagnostics.getStartup()),
  selfTest: () =>
    unwrap(requireBridge().diagnostics.selfTest()),
}

export const providerApi = {
  getManifest: () =>
    unwrap(requireBridge().provider.getManifest()),
  getCapabilities: () =>
    unwrap(requireBridge().provider.getCapabilities()),
}

export const configSourceApi = {
  getMeta: () =>
    unwrap(requireBridge().configSource.getMeta()),
  set: (payload: Parameters<SlaveVPNBridge['configSource']['set']>[0]) =>
    unwrap(requireBridge().configSource.set(payload)),
  validate: (payload: Parameters<SlaveVPNBridge['configSource']['validate']>[0]) =>
    unwrap(requireBridge().configSource.validate(payload)),
  clear: () =>
    unwrap(requireBridge().configSource.clear()),
}

export const serversApi = {
  list: () =>
    unwrap(requireBridge().servers.list()),
}

export const safeModeApi = {
  getStatus: () =>
    unwrap(requireBridge().safeMode.getStatus()),
  reset: () =>
    unwrap(requireBridge().safeMode.reset()),
}

export const runtimeApi = {
  restart: () =>
    unwrap(requireBridge().runtime.restart()),
}

export const cacheApi = {
  clear: () =>
    unwrap(requireBridge().cache.clear()),
}

export const dnsApi = {
  getProfile: () =>
    unwrap(requireBridge().dns.getProfile()),
  setProfile: (payload: DnsSetProfilePayload) =>
    unwrap(requireBridge().dns.setProfile(payload)),
  getPresets: () =>
    unwrap(requireBridge().dns.getPresets()),
  getStrategies: () =>
    unwrap(requireBridge().dns.getStrategies()),
  leakTest: () =>
    unwrap(requireBridge().dns.leakTest()),
}

export const rulesApi = {
  list: () =>
    unwrap(requireBridge().rules.list()),
  add: (payload: RuleProviderAddPayload) =>
    unwrap(requireBridge().rules.add(payload)),
  remove: (payload: RuleProviderRemovePayload) =>
    unwrap(requireBridge().rules.remove(payload)),
  update: (payload: RuleProviderUpdatePayload) =>
    unwrap(requireBridge().rules.update(payload)),
  reorder: (payload: RuleProviderReorderPayload) =>
    unwrap(requireBridge().rules.reorder(payload)),
  reload: () =>
    unwrap(requireBridge().rules.reload()),
}

export const splitApi = {
  getProcesses: () =>
    unwrap(requireBridge().split.getProcesses()),
  getProcessList: () =>
    unwrap(requireBridge().split.getProcessList()),
  setProcessList: (payload: SplitSetProcessListPayload) =>
    unwrap(requireBridge().split.setProcessList(payload)),
  // Android-only (per-app VPN). Resolves to [] where unsupported (desktop).
  listApps: () => {
    const split = requireBridge().split
    return split.listApps ? unwrap(split.listApps()) : Promise.resolve([])
  },
}

export const routingApi = {
  listScenarios: () =>
    unwrap(requireBridge().routing.listScenarios()),
  setEnabledScenarios: (scenarioIds: string[]) =>
    unwrap(requireBridge().routing.setEnabledScenarios({ scenarioIds })),
}

export const geoApi = {
  getState: () => unwrap(requireBridge().geo.getState()),
  updateAll: () => unwrap(requireBridge().geo.updateAll()),
  updateOne: (id: string) => unwrap(requireBridge().geo.updateOne({ id })),
  listSources: () => unwrap(requireBridge().geo.listSources()),
}

export const profilesApi = {
  list: () =>
    unwrap(requireBridge().profiles.list()),
  saveCurrent: (payload: ProfileCreateInput) =>
    unwrap(requireBridge().profiles.saveCurrent(payload)),
  remove: (id: string) =>
    unwrap(requireBridge().profiles.remove({ id })),
  apply: (payload: ProfileApplyPayload) =>
    unwrap(requireBridge().profiles.apply(payload)),
}

export const subscriptionsApi = {
  list: () =>
    unwrap(requireBridge().subscriptions.list()),
  add: (payload: SubscriptionAddPayload) =>
    unwrap(requireBridge().subscriptions.add(payload)),
  remove: (payload: SubscriptionRemovePayload) =>
    unwrap(requireBridge().subscriptions.remove(payload)),
  update: (payload: SubscriptionUpdatePayload) =>
    unwrap(requireBridge().subscriptions.update(payload)),
  refresh: (payload: SubscriptionRefreshPayload) =>
    unwrap(requireBridge().subscriptions.refresh(payload)),
  refreshAll: () =>
    unwrap(requireBridge().subscriptions.refreshAll()),
  detectClipboard: () =>
    unwrap(requireBridge().subscriptions.detectClipboard()),
}

export const updateApi = {
  check: () =>
    unwrap(requireBridge().update.check()),
  download: () =>
    unwrap(requireBridge().update.download()),
  install: () =>
    unwrap(requireBridge().update.install()),
  getStatus: () =>
    unwrap(requireBridge().update.getStatus()),
  setChannel: (payload: UpdateSetChannelPayload) =>
    unwrap(requireBridge().update.setChannel(payload)),
}

export const events = {
  onVpnStatus: (...args: Parameters<SlaveVPNBridge['events']['onVpnStatus']>) =>
    getBridge()?.events.onVpnStatus(...args) ?? NOOP_UNSUB,
  onVpnTraffic: (...args: Parameters<SlaveVPNBridge['events']['onVpnTraffic']>) =>
    getBridge()?.events.onVpnTraffic(...args) ?? NOOP_UNSUB,
  onVpnError: (...args: Parameters<SlaveVPNBridge['events']['onVpnError']>) =>
    getBridge()?.events.onVpnError(...args) ?? NOOP_UNSUB,
  onVpnHealth: (...args: Parameters<SlaveVPNBridge['events']['onVpnHealth']>) =>
    getBridge()?.events.onVpnHealth(...args) ?? NOOP_UNSUB,
  onRuntimeEvent: (...args: Parameters<SlaveVPNBridge['events']['onRuntimeEvent']>) =>
    getBridge()?.events.onRuntimeEvent(...args) ?? NOOP_UNSUB,
  onSubscriptionUpdated: (...args: Parameters<SlaveVPNBridge['events']['onSubscriptionUpdated']>) =>
    getBridge()?.events.onSubscriptionUpdated(...args) ?? NOOP_UNSUB,
  onAuthExpired: (...args: Parameters<SlaveVPNBridge['events']['onAuthExpired']>) =>
    getBridge()?.events.onAuthExpired(...args) ?? NOOP_UNSUB,
  onUpdateAvailable: (...args: Parameters<SlaveVPNBridge['events']['onUpdateAvailable']>) =>
    getBridge()?.events.onUpdateAvailable(...args) ?? NOOP_UNSUB,
  onUpdateDownloaded: (...args: Parameters<SlaveVPNBridge['events']['onUpdateDownloaded']>) =>
    getBridge()?.events.onUpdateDownloaded(...args) ?? NOOP_UNSUB,
  onUpdateProgress: (...args: Parameters<SlaveVPNBridge['events']['onUpdateProgress']>) =>
    getBridge()?.events.onUpdateProgress(...args) ?? NOOP_UNSUB,
  onNotification: (...args: Parameters<SlaveVPNBridge['events']['onNotification']>) =>
    getBridge()?.events.onNotification(...args) ?? NOOP_UNSUB,
  onBalancerState: (callback: (state: BalancerState) => void) =>
    getBridge()?.events.onBalancerState(callback) ?? NOOP_UNSUB,
  onProxyChanged: (callback: (proxyName: string) => void) =>
    getBridge()?.events.onProxyChanged(callback) ?? NOOP_UNSUB,
  onServerLatency: (...args: Parameters<SlaveVPNBridge['events']['onServerLatency']>) =>
    getBridge()?.events.onServerLatency(...args) ?? NOOP_UNSUB,
  onSubscriptionsChanged: (...args: Parameters<SlaveVPNBridge['events']['onSubscriptionsChanged']>) =>
    getBridge()?.events.onSubscriptionsChanged(...args) ?? NOOP_UNSUB,
  onProfilesChanged: (...args: Parameters<SlaveVPNBridge['events']['onProfilesChanged']>) =>
    getBridge()?.events.onProfilesChanged(...args) ?? NOOP_UNSUB,
  onGeoUpdaterState: (...args: Parameters<SlaveVPNBridge['events']['onGeoUpdaterState']>) =>
    getBridge()?.events.onGeoUpdaterState(...args) ?? NOOP_UNSUB,
}
