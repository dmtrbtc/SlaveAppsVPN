import type { RoutingPolicy } from '../models/RoutingPolicy'
import type { RoutingRule, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario, ScenarioId } from './types'
import { getScenarioById, listScenarios } from './registry'

// Pick the effective default action (the final MATCH rule) from the enabled
// scenarios that DECLARE one (a non-null defaultAction marks a "base" scenario —
// e.g. roscomvpn-default 'proxy', smart-russia-bypass 'direct', smart-global
// 'proxy'). Add-on scenarios (ai-services, gaming, runetfreedom, …) declare null
// and don't influence the base.
//
// Precedence:
//   1. smart-global forces proxy-everything when present.
//   2. Otherwise prefer 'proxy' over 'direct': if ANY enabled base scenario wants
//      proxy-by-default (roscomvpn-default / smart-global), unmatched traffic
//      tunnels — so blocked sites that aren't in an explicit allow-list still
//      work, while the scenario's own RU/whitelist rules keep RU traffic DIRECT.
//   3. Fallback 'direct' only when no base scenario is enabled.
//
// Previously this checked ONLY smart-global + smart-russia-bypass, so
// roscomvpn-default's declared 'proxy' was silently dropped → everything
// unmatched went DIRECT → RU IP, and RU-blocked sites/Telegram-by-IP failed.
function resolveDefaultAction(scenarios: readonly RoutingScenario[]): RuleAction {
  const global = scenarios.find(s => s.id === 'smart-global')
  if (global?.defaultAction) return global.defaultAction

  const declared = scenarios
    .map(s => s.defaultAction)
    .filter((a): a is 'proxy' | 'direct' => a != null)

  if (declared.includes('proxy')) return 'proxy'
  if (declared.includes('direct')) return 'direct'
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

  // Merge rules from every enabled scenario, de-duplicating by rule id.
  // Multiple scenarios independently emit the same shared rules (notably the
  // private-network CIDRs `private:192.168.0.0/16` etc.), which previously
  // collided as DUPLICATE_ID, failed pipeline validation, and silently dropped
  // the ENTIRE composed policy back to legacy mode (no Russia bypass → RU sites
  // saw the VPN exit IP). Identical ids are identical rules, so first-wins is
  // safe; scenarios are processed in enabled order so earlier ones take priority.
  const seenRuleIds = new Set<string>()
  const allRules: RoutingRule[] = []
  let droppedDuplicates = 0
  for (const s of scenarios) {
    for (const rule of s.rules) {
      if (seenRuleIds.has(rule.id)) {
        droppedDuplicates++
        continue
      }
      seenRuleIds.add(rule.id)
      allRules.push(rule)
    }
  }
  if (droppedDuplicates > 0) {
    warnings.push(`Merged ${droppedDuplicates} duplicate rule(s) shared across scenarios`)
  }

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
