import type { AppSettings, AppProfileSnapshot } from '../settings/types.js'

/**
 * Pure transforms between AppSettings and a profile snapshot. The ProfileStore
 * (persistence) is wired per-platform over StorageAdapter; these capture/apply
 * the settings subset a profile carries.
 */

/** Capture the profile-relevant slice of current settings (+ optional active subscription). */
export function captureSnapshot(settings: AppSettings, subscriptionId?: string): AppProfileSnapshot {
  return {
    ...(subscriptionId ? { subscriptionId } : {}),
    enabledScenarios: [...settings.enabledScenarios],
    dnsPreset: settings.dnsPreset,
    dnsStrategy: settings.dnsStrategy,
    selectedEngine: settings.selectedEngine,
    selectedProxy: settings.selectedProxy,
    vpnMode: settings.vpnMode,
    balancerEnabled: settings.balancerEnabled,
  }
}

/** Map a snapshot into a settings patch (only the fields the snapshot sets). */
export function applySnapshot(snapshot: AppProfileSnapshot): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {}
  if (snapshot.enabledScenarios !== undefined) patch.enabledScenarios = [...snapshot.enabledScenarios]
  if (snapshot.dnsPreset !== undefined) patch.dnsPreset = snapshot.dnsPreset
  if (snapshot.dnsStrategy !== undefined) patch.dnsStrategy = snapshot.dnsStrategy
  if (snapshot.selectedEngine !== undefined) patch.selectedEngine = snapshot.selectedEngine
  if (snapshot.selectedProxy !== undefined) patch.selectedProxy = snapshot.selectedProxy
  if (snapshot.vpnMode !== undefined) patch.vpnMode = snapshot.vpnMode
  if (snapshot.balancerEnabled !== undefined) patch.balancerEnabled = snapshot.balancerEnabled
  return patch
}
