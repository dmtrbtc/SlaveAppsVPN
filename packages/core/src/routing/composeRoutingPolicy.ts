import {
  composeScenarios,
  RoutingPipeline,
  listScenarioMetadata,
  type NormalizedPolicy,
  type ScenarioId,
} from '@slave-vpn/routing'
import type { VPNMode } from '@slave-vpn/shared'

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

// ─── Mode → routing policy ─────────────────────────────────────────────────────
// The VPN MODE is the master routing control; scenarios are the detail layer used
// only in 'custom'. This resolves which policy (if any) the engine should use:
//
//   full   → null  → engine emits the legacy full-tunnel rules (MATCH→proxy);
//                    EVERYTHING (incl. RU) goes through the VPN.
//   split  → null  → engine emits the legacy split rules (only selected
//                    processes/apps through the VPN, MATCH→DIRECT).
//   bypass → roscomvpn-default → RU services/banks/sites DIRECT (geoip:RU +
//                    geosite:category-ru), and EVERYTHING ELSE (blocked-in-RU and
//                    foreign) through the VPN (defaultAction=proxy). The default
//                    daily mode for RU. (NOT smart-russia-bypass, whose
//                    defaultAction is DIRECT — that would send foreign traffic
//                    direct, the opposite of what's wanted here.)
//   custom → the user's enabled scenarios from the Маршруты tab.
//
// Before this, a composed scenario policy ALWAYS won over the vpnMode rules
// (ConfigGenerator), so the Полный/Раздельный buttons were dead and traffic
// followed whatever scenario was active. Now the mode decides.
const BYPASS_SCENARIOS: readonly ScenarioId[] = ['roscomvpn-default']

export function resolveRoutingPolicyForMode(
  mode: VPNMode,
  enabledScenarios: readonly string[],
): ComposeRoutingResult {
  switch (mode) {
    case 'full':
    case 'split':
      // No scenario policy — the engine's legacy vpnMode rules drive it.
      return { policy: null, warnings: [], valid: true, errors: [] }
    case 'bypass':
      return composeRoutingPolicy(BYPASS_SCENARIOS)
    case 'custom':
    default:
      return composeRoutingPolicy(enabledScenarios)
  }
}
