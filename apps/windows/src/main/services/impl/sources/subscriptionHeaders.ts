import { app } from 'electron'
import { getDeviceIdentity } from '../WindowsDeviceIdentity'
import { getSettingsStore } from '../../SettingsStore'

const UA_PROFILES: Record<string, string> = {
  mihomo:  'Mihomo/1.18.7',
  singbox: 'sing-box/1.9.0',
  xray:    'Xray/1.8.7',
}

export function buildSubscriptionHeaders(uaOverride?: string): Record<string, string> {
  const engine = getSettingsStore().get('selectedEngine') ?? 'mihomo'
  const ua: string = uaOverride ?? UA_PROFILES[engine] ?? 'Mihomo/1.18.7'

  return {
    'User-Agent':       ua,
    'Accept':           'text/plain, application/x-yaml, */*',
    'X-HWID':           getDeviceIdentity().getHwid(),
    'X-Client-Version': app.getVersion(),
    'X-Platform':       'windows',
    'X-Engine':         engine,
  }
}

export function getEngineUserAgents(): string[] {
  return Object.values(UA_PROFILES)
}
