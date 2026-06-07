import {
  listScenarioMetadata,
  composeScenarios,
  RoutingPipeline,
  type NormalizedPolicy,
  type ScenarioId,
  type ScenarioMetadata,
} from '@slave-vpn/routing'
import { getSettingsStore } from './SettingsStore'
import { getLogger } from '../logger'
import type { RoutingScenarioInfo } from '../../shared/ipc/types'

export class RoutingScenarioService {
  private readonly pipeline = new RoutingPipeline()

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
    const ids = this.getEnabledIds()
    if (ids.length === 0) return null

    const { policy, warnings } = composeScenarios(ids)
    for (const w of warnings) {
      getLogger().warn({ warning: w }, 'Scenario composition warning')
    }

    const result = this.pipeline.process(policy)
    if (!result.validation.valid) {
      const messages = result.validation.errors.map(e => e.message).join('; ')
      getLogger().error({ messages }, 'Composed policy failed validation; falling back to legacy mode')
      return null
    }
    return result.policy
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
