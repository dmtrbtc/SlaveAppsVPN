import type { SlaveVPNBridge } from '@shared/ipc/types'

function assertBridge(): SlaveVPNBridge {
  if (!window.slaveVPN) {
    throw new Error('[IPC] Bridge not available — preload not initialized')
  }
  return window.slaveVPN
}

async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }>): Promise<T> {
  const result = await promise
  if (!result.ok) {
    const err = new Error(result.error.message)
    ;(err as Error & { code: string }).code = result.error.code
    throw err
  }
  return result.data
}

export const authApi = {
  loginEmail: (email: string, password: string) =>
    unwrap(assertBridge().auth.loginEmail({ email, password })),
  loginTelegram: (initData: string) =>
    unwrap(assertBridge().auth.loginTelegram({ initData })),
  logout: () =>
    unwrap(assertBridge().auth.logout()),
  getMe: () =>
    unwrap(assertBridge().auth.getMe()),
  refresh: () =>
    unwrap(assertBridge().auth.refresh()),
}

export const vpnApi = {
  connect: () =>
    unwrap(assertBridge().vpn.connect()),
  disconnect: () =>
    unwrap(assertBridge().vpn.disconnect()),
  getStatus: () =>
    unwrap(assertBridge().vpn.getStatus()),
  setMode: (mode: Parameters<SlaveVPNBridge['vpn']['setMode']>[0]['mode']) =>
    unwrap(assertBridge().vpn.setMode({ mode })),
}

export const subscriptionApi = {
  get: () =>
    unwrap(assertBridge().subscription.get()),
  refresh: () =>
    unwrap(assertBridge().subscription.refresh()),
  getDevices: () =>
    unwrap(assertBridge().subscription.getDevices()),
  removeDevice: (hwid: string) =>
    unwrap(assertBridge().subscription.removeDevice({ hwid })),
}

export const settingsApi = {
  get: () =>
    unwrap(assertBridge().settings.get()),
  set: (partial: Parameters<SlaveVPNBridge['settings']['set']>[0]) =>
    unwrap(assertBridge().settings.set(partial)),
}

export const diagnosticsApi = {
  collect: () =>
    unwrap(assertBridge().diagnostics.collect()),
  getLogs: () =>
    unwrap(assertBridge().diagnostics.getLogs()),
  exportLogs: () =>
    unwrap(assertBridge().diagnostics.exportLogs()),
}

export const events = {
  onVpnStatus: (...args: Parameters<SlaveVPNBridge['events']['onVpnStatus']>) =>
    assertBridge().events.onVpnStatus(...args),
  onVpnTraffic: (...args: Parameters<SlaveVPNBridge['events']['onVpnTraffic']>) =>
    assertBridge().events.onVpnTraffic(...args),
  onVpnError: (...args: Parameters<SlaveVPNBridge['events']['onVpnError']>) =>
    assertBridge().events.onVpnError(...args),
  onSubscriptionUpdated: (...args: Parameters<SlaveVPNBridge['events']['onSubscriptionUpdated']>) =>
    assertBridge().events.onSubscriptionUpdated(...args),
  onAuthExpired: (...args: Parameters<SlaveVPNBridge['events']['onAuthExpired']>) =>
    assertBridge().events.onAuthExpired(...args),
  onUpdateAvailable: (...args: Parameters<SlaveVPNBridge['events']['onUpdateAvailable']>) =>
    assertBridge().events.onUpdateAvailable(...args),
  onUpdateDownloaded: (...args: Parameters<SlaveVPNBridge['events']['onUpdateDownloaded']>) =>
    assertBridge().events.onUpdateDownloaded(...args),
  onNotification: (...args: Parameters<SlaveVPNBridge['events']['onNotification']>) =>
    assertBridge().events.onNotification(...args),
}
