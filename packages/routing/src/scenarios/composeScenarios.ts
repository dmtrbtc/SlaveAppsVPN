import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario, ScenarioId } from './types'
import { getScenarioById, listScenarios } from './registry'

// Pick the strongest defaultAction across enabled scenarios.
// Rule: smart-global wins if present (proxy-everything); otherwise smart-russia-bypass (direct);
// otherwise fallback to 'direct' so unmatched traffic doesn't accidentally tunnel.
function resolveDefaultAction(scenarios: readonly RoutingScenario[]): RuleAction {
  const global = scenarios.find(s => s.id === 'smart-global')
  if (global?.defaultAction) return global.defaultAction
  const ruBypass = scenarios.find(s => s.id === 'smart-russia-bypass')
  if (ruBypass?.defaultAction) return ruBypass.defaultAction
  return 'direct'
}

export interface ComposeResult {
  policy: RoutingPolicy
  enabledScenarios: readonly ScenarioId[]
  warnings: string[]
}

export function composeScenarios(enabledIds: readonly ScenarioId[]): ComposeResult {
  const warnings: string[] = []
  const seen = new Set<ScenarioId>()
  const scenarios: RoutingScenario[] = []

  for (const id of enabledIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const scenario = getScenarioById(id)
    if (!scenario) {
      warnings.push(`Unknown scenario: ${id}`)
      continue
    }
    scenarios.push(scenario)
  }

  // Enforce mutual exclusivity: smart-global and smart-russia-bypass cannot coexist.
  const hasGlobal = scenarios.some(s => s.id === 'smart-global')
  const hasRu = scenarios.some(s => s.id === 'smart-russia-bypass')
  if (hasGlobal && hasRu) {
    warnings.push('smart-global and smart-russia-bypass are mutually exclusive; preferring smart-global')
    // Drop the russia bypass — smart-global is stricter (proxy everything)
    const idx = scenarios.findIndex(s => s.id === 'smart-russia-bypass')
    if (idx !== -1) scenarios.splice(idx, 1)
  }

  const allRules: RoutingRule[] = scenarios.flatMap(s => [...s.rules])

  const policy: RoutingPolicy = {
    mode: 'custom',
    defaultAction: resolveDefaultAction(scenarios),
    processRules: [],
    userRules: [],
    providerRules: allRules,
    geoRules: [],
  }

  return {
    policy,
    enabledScenarios: scenarios.map(s => s.id),
    warnings,
  }
}

// Convenience: returns the default-enabled set (used on first run).
export function getDefaultEnabledScenarios(): readonly ScenarioId[] {
  return listScenarios()
    .filter(s => s.defaultEnabled)
    .map(s => s.id)
}
