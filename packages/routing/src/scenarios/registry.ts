import type { RoutingScenario, ScenarioId, ScenarioMetadata } from './types'
import { createSmartRussiaBypassScenario } from './SmartRussiaBypass'
import { createSmartGlobalScenario } from './SmartGlobal'
import { createAdBlockScenario } from './AdBlock'
import { createStreamingScenario } from './Streaming'
import { createAIServicesScenario } from './AIServices'
import { createGamingScenario } from './Gaming'

// Cached so repeated calls don't rebuild rule arrays.
let _cache: readonly RoutingScenario[] | null = null

function build(): readonly RoutingScenario[] {
  return [
    createSmartRussiaBypassScenario(),
    createSmartGlobalScenario(),
    createAdBlockScenario(),
    createStreamingScenario(),
    createAIServicesScenario(),
    createGamingScenario(),
  ]
}

export function listScenarios(): readonly RoutingScenario[] {
  if (!_cache) _cache = build()
  return _cache
}

export function listScenarioMetadata(): readonly ScenarioMetadata[] {
  return listScenarios().map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    icon: s.icon,
    defaultEnabled: s.defaultEnabled,
    composable: s.composable,
    ruleCount: s.rules.length,
  }))
}

export function getScenarioById(id: ScenarioId): RoutingScenario | null {
  return listScenarios().find(s => s.id === id) ?? null
}
