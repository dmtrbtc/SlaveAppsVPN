import {
  listScenarioMetadata,
  type NormalizedPolicy,
  type ScenarioId,
  type ScenarioMetadata,
} from '@slave-vpn/routing'
import { composeRoutingPolicy, resolveRoutingPolicyForMode } from '@slave-vpn/core'
import type { VPNMode } from '@slave-vpn/shared'
import { getSettingsStore } from './SettingsStore'
import { getLogger } from '../logger'
import type { RoutingScenarioInfo } from '../../shared/ipc/types'

export class RoutingScenarioService {
  list(): RoutingScenarioInfo[] {
    const enabled = new Set(this.getEnabledIds())
    return listScenarioMetadata().map(m => this.toInfo(m, enabled.has(m.id)))
  }

  setEnabled(ids: string[]): RoutingScenarioInfo[] {
    const valid = new Set(listScenarioMetadata().map(m => m.id))
    const filtered = ids.filter((id): id is ScenarioId => valid.has(id as ScenarioId))
    getSettingsStore().patch({ enabledScenarios: filtered })
    getLogger().info({ enabled: filtered }, 'Routing scenarios updated')
    return this.list()
  }

  // Compose the engine-ready policy from currently enabled scenarios.
  // Returns null when nothing is enabled — caller falls back to vpnMode-based legacy rules.
  composePolicy(): NormalizedPolicy | null {
    const { policy, warnings, valid, errors } = composeRoutingPolicy(this.getEnabledIds())
    this.logComposition(warnings, valid, errors)
    return policy
  }

  // Mode-aware composition. The VPN mode is the master control: full/split use
  // the engine's legacy vpnMode rules (policy=null), bypass = Smart-Russia,
  // custom = the user's enabled scenarios. Fixes the "Полный VPN не работает,
  // трафик идёт раздельно" bug where a scenario policy always overrode the mode.
  composePolicyForMode(mode: VPNMode): NormalizedPolicy | null {
    const { policy, warnings, valid, errors } = resolveRoutingPolicyForMode(mode, this.getEnabledIds())
    this.logComposition(warnings, valid, errors)
    return policy
  }

  private logComposition(warnings: string[], valid: boolean, errors: string[]): void {
    for (const w of warnings) {
      getLogger().warn({ warning: w }, 'Scenario composition warning')
    }
    if (!valid) {
      getLogger().error(
        { messages: errors.join('; ') },
        'Composed policy failed validation; falling back to legacy mode',
      )
    }
  }

  private getEnabledIds(): ScenarioId[] {
    const raw = getSettingsStore().get('enabledScenarios') ?? []
    const valid = new Set(listScenarioMetadata().map(m => m.id))
    return raw.filter((id): id is ScenarioId => valid.has(id as ScenarioId))
  }

  private toInfo(m: ScenarioMetadata, enabled: boolean): RoutingScenarioInfo {
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      category: m.category,
      icon: m.icon,
      defaultEnabled: m.defaultEnabled,
      composable: m.composable,
      ruleCount: m.ruleCount,
      enabled,
    }
  }
}

let _instance: RoutingScenarioService | null = null

export function getRoutingScenarioService(): RoutingScenarioService {
  if (!_instance) _instance = new RoutingScenarioService()
  return _instance
}
