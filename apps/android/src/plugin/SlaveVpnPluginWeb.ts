import { WebPlugin } from '@capacitor/core'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { SlaveVpnPluginInterface } from './types'

const NOT_AVAILABLE = 'SlaveVpn plugin: web/dev fallback — native Android only.'

/**
 * Web fallback for the SlaveVpn plugin. Used when running the renderer
 * in a regular browser (e.g. for UI development). Returns sane defaults
 * so the UI doesn't crash, but throws for any operation that needs the
 * actual VPN runtime.
 */
export class SlaveVpnPluginWeb extends WebPlugin implements SlaveVpnPluginInterface {
  async checkPermission(): ReturnType<SlaveVpnPluginInterface['checkPermission']> {
    return { granted: false }
  }
  async requestPermission(): ReturnType<SlaveVpnPluginInterface['requestPermission']> {
    return { granted: false }
  }

  async connect(): ReturnType<SlaveVpnPluginInterface['connect']> {
    throw new Error(NOT_AVAILABLE)
  }
  async disconnect(): ReturnType<SlaveVpnPluginInterface['disconnect']> {
    // No-op — safe to call when nothing is running
  }

  async getStatus(): ReturnType<SlaveVpnPluginInterface['getStatus']> {
    return { status: INITIAL_VPN_STATUS }
  }

  async getTraffic(): ReturnType<SlaveVpnPluginInterface['getTraffic']> {
    return { traffic: EMPTY_TRAFFIC_STATS }
  }

  async setMode(): ReturnType<SlaveVpnPluginInterface['setMode']> {
    // No-op in web fallback
  }

  async listSubscriptions(): ReturnType<SlaveVpnPluginInterface['listSubscriptions']> {
    return { entries: [] }
  }
  async addSubscription(): ReturnType<SlaveVpnPluginInterface['addSubscription']> {
    throw new Error(NOT_AVAILABLE)
  }
  async removeSubscription(): ReturnType<SlaveVpnPluginInterface['removeSubscription']> {
    throw new Error(NOT_AVAILABLE)
  }
  async refreshSubscription(): ReturnType<SlaveVpnPluginInterface['refreshSubscription']> {
    throw new Error(NOT_AVAILABLE)
  }

  async getLogs(): ReturnType<SlaveVpnPluginInterface['getLogs']> {
    return { lines: [`[web-fallback] ${NOT_AVAILABLE}`] }
  }

  async setEngine(): ReturnType<SlaveVpnPluginInterface['setEngine']> {
    // No-op in web fallback
  }
}
