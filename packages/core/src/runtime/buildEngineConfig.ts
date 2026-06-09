import { generateMihomoConfig, type ConfigGenerationContext } from '@slave-vpn/config'
import type { NormalizedPolicy } from '@slave-vpn/routing'
import { composeRoutingPolicy } from '../routing/composeRoutingPolicy.js'

/**
 * Canonical engine-config builder, shared by both platforms.
 *
 * Today Windows builds the config in RuntimeServiceImpl (routingPolicy +
 * dnsProfile) and Android builds it in android/compile-config.ts
 * (androidRouting). Both call the same `generateMihomoConfig`, but with
 * different orchestration. This function centralises the orchestration so the
 * two paths converge:
 *
 *  - pass `enabledScenarioIds` and it composes the routing policy here (the
 *    Windows model — which P1 brings to Android), falling back to legacy
 *    vpnMode rules when composition is empty/invalid;
 *  - or pass a ready `routingPolicy` / `androidRouting` to preserve a caller's
 *    existing behaviour verbatim during the transition.
 *
 * `availableGeoSites` (read from the engine's geosite.dat) lets the generator
 * drop GEOSITE rules for unknown categories — unified across platforms instead
 * of the Windows-only reader from alpha.5.
 */
export interface BuildEngineConfigInput
  extends Omit<ConfigGenerationContext, 'routingPolicy'> {
  /** Pre-composed policy (Windows today). Wins over enabledScenarioIds. */
  routingPolicy?: NormalizedPolicy
  /** Enabled scenario ids → composed into a policy here. */
  enabledScenarioIds?: readonly string[]
}

export interface BuildEngineConfigResult {
  config: string
  warnings: string[]
  /** False when scenario composition was attempted but failed validation. */
  routingValid: boolean
}

export function buildEngineConfig(input: BuildEngineConfigInput): BuildEngineConfigResult {
  const warnings: string[] = []
  let routingPolicy = input.routingPolicy
  let routingValid = true

  // Compose from scenario ids only when no explicit policy was supplied and the
  // caller isn't using the legacy androidRouting path.
  if (!routingPolicy && input.enabledScenarioIds && !input.androidRouting) {
    const composed = composeRoutingPolicy(input.enabledScenarioIds)
    warnings.push(...composed.warnings)
    routingValid = composed.valid
    if (composed.policy) routingPolicy = composed.policy
    if (!composed.valid) {
      warnings.push(`routing policy invalid (${composed.errors.join('; ')}); using legacy rules`)
    }
  }

  const ctx: ConfigGenerationContext = {
    ...input,
    ...(routingPolicy ? { routingPolicy } : {}),
  }
  // enabledScenarioIds is a core-only field; strip it before handing to the generator.
  delete (ctx as { enabledScenarioIds?: unknown }).enabledScenarioIds

  const config = generateMihomoConfig(ctx)
  return { config, warnings, routingValid }
}
