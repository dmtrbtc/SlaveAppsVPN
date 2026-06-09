import {
  composeScenarios,
  RoutingPipeline,
  listScenarioMetadata,
  type NormalizedPolicy,
  type ScenarioId,
} from '@slave-vpn/routing'

export interface ComposeRoutingResult {
  /** Engine-ready normalized policy, or null when nothing valid is enabled. */
  policy: NormalizedPolicy | null
  /** Non-fatal composition notes (e.g. merged duplicate rules). */
  warnings: string[]
  /** False when the composed policy failed validation (caller falls back to legacy). */
  valid: boolean
  /** Validation error messages when !valid. */
  errors: string[]
}

const pipeline = new RoutingPipeline()

function validScenarioIds(ids: readonly string[]): ScenarioId[] {
  const known = new Set(listScenarioMetadata().map((m) => m.id))
  return ids.filter((id): id is ScenarioId => known.has(id as ScenarioId))
}

/**
 * Compose the engine-ready routing policy from a set of enabled scenario ids.
 *
 * This is the platform-agnostic version of the Windows-only
 * RoutingScenarioService.composePolicy — moved into core so BOTH platforms
 * share one routing model (Android currently uses a separate hardcoded path).
 *
 * Returns `policy: null` when no scenarios are enabled OR when the composed
 * policy fails pipeline validation — the caller then falls back to legacy
 * vpnMode-based rules. (The composeScenarios step de-duplicates rules shared
 * across scenarios; see the alpha.5 RU-bypass fix.)
 */
export function composeRoutingPolicy(enabledIds: readonly string[]): ComposeRoutingResult {
  const ids = validScenarioIds(enabledIds)
  if (ids.length === 0) {
    return { policy: null, warnings: [], valid: true, errors: [] }
  }

  const { policy, warnings } = composeScenarios(ids)
  const result = pipeline.process(policy)

  if (!result.validation.valid) {
    return {
      policy: null,
      warnings,
      valid: false,
      errors: result.validation.errors.map((e) => e.message),
    }
  }

  return { policy: result.policy, warnings, valid: true, errors: [] }
}
