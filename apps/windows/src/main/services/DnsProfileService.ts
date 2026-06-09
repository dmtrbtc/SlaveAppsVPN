// Thin Windows facade over the platform-agnostic DNS model in @slave-vpn/core
// (P0.3). The preset catalogue, strategy list, and the preset→DnsProfile bridge
// all live in core now; this module just re-exports them under the names the
// rest of the Windows main process already imports, so callers are unchanged.

import type { DnsProfile } from '@slave-vpn/dns'
import {
  DNS_PRESETS as CORE_DNS_PRESETS,
  DNS_STRATEGIES as CORE_DNS_STRATEGIES,
  buildDnsProfileConfig as coreBuildDnsProfileConfig,
  getDnsPresets,
  getDnsStrategies,
  resolveDnsProfile,
} from '@slave-vpn/core'
import type {
  DnsProfileConfig,
  DnsPresetName,
  DnsPresetInfo,
  DnsStrategyName,
  DnsStrategyInfo,
} from '../../shared/ipc/types'

export const DNS_STRATEGIES: DnsStrategyInfo[] = CORE_DNS_STRATEGIES
export const DNS_PRESETS: DnsPresetInfo[] = CORE_DNS_PRESETS

export function buildDnsProfileConfig(preset: DnsPresetName, custom?: DnsProfileConfig | null): DnsProfileConfig {
  return coreBuildDnsProfileConfig(preset, custom)
}

export function getPresets(): DnsPresetInfo[] {
  return getDnsPresets()
}

export function getStrategies(): DnsStrategyInfo[] {
  return getDnsStrategies()
}

export function buildEngineDnsProfile(
  preset: DnsPresetName,
  custom?: DnsProfileConfig | null,
  strategyOverride?: DnsStrategyName,
): DnsProfile {
  return resolveDnsProfile(preset, custom, strategyOverride)
}
