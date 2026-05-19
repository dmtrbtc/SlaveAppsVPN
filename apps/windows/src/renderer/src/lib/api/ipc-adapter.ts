import type { SlaveVPNBridge, UpdateSetChannelPayload } from '@shared/ipc/types'

const IPC_TIMEOUT_MS = 15_000
const NOOP_UNSUB = (): void => {}

function requireBridge(): SlaveVPNBridge {
  if (!window.slaveVPN) {
    throw new Error('[IPC] Bridge not available — preload not initialized')
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
}
