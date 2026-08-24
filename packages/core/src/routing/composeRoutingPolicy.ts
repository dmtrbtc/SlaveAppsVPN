import {
  composeScenarios,
  RoutingPipeline,
  listScenarioMetadata,
  RUSSIA_BYPASS_PRIVATE_DIRECT,
  type NormalizedPolicy,
  type RoutingPolicy,
  type RoutingRule,
  type ScenarioId,
} from '@slave-vpn/routing'
import type { VPNMode } from '@slave-vpn/shared'
import type { CustomRoutingRule } from '../settings/types.js'

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

// ─── User per-domain overrides («Свои правила») ───────────────────────────────
// Convert the settings-shape rules into engine RoutingRules at priority 50+
// — ABOVE every scenario band (private nets start at 100, messengers 1300,
// bypass 1500…), so a user rule always wins over scenario rules.
const USER_RULE_BASE_PRIORITY = 50

function toUserRoutingRules(rules: readonly CustomRoutingRule[]): RoutingRule[] {
  return rules.map((r, i) => ({
    id: `user:${r.id}`,
    target: {
      type: r.matchType === 'exact' ? ('domain' as const) : ('domain_suffix' as const),
      value: r.domain,
    },
    action: r.action,
    priority: USER_RULE_BASE_PRIORITY + i,
    source: { provider: 'user-rules' },
  }))
}

// Private-network CIDRs → DIRECT, re-prioritised into the standard 100+ band.
// Used by the minimal full/split policies so LAN/loopback never tunnels —
// identical semantics to the legacy PRIVATE_DIRECT_RULES in the generator.
function privateDirectRules(): RoutingRule[] {
  return RUSSIA_BYPASS_PRIVATE_DIRECT.map((r, i) => ({ ...r, priority: 100 + i }))
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
export function composeRoutingPolicy(
  enabledIds: readonly string[],
  userRules: readonly RoutingRule[] = [],
): ComposeRoutingResult {
  const ids = validScenarioIds(enabledIds)
  if (ids.length === 0 && userRules.length === 0) {
    return { policy: null, warnings: [], valid: true, errors: [] }
  }

  const { policy, warnings } = composeScenarios(ids)
  // User per-domain overrides ride in the dedicated userRules bucket; their
  // priority band (50+) puts them above every scenario rule after normalization.
  const withUser: RoutingPolicy = userRules.length > 0 ? { ...policy, userRules } : policy
  const result = pipeline.process(withUser)

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
// «Только заблокированное» — defaultAction DIRECT, only the RKN-list rule-providers
// (inside-raw + Re-filter, action=proxy) and the explicit AI-service dependencies
// tunnel; everything else (incl. foreign) goes DIRECT. The inverse of bypass
// (proxy-default). The AI add-on keeps defaultAction=null, so composing it with
// smart-russia-bypass preserves the required DIRECT default.
const BLOCKED_ONLY_SCENARIOS: readonly ScenarioId[] = ['smart-russia-bypass', 'ai-services']

export interface ResolveRoutingOptions {
  /** User per-domain overrides («Свои правила») — applied in EVERY mode. */
  customRules?: readonly CustomRoutingRule[]
  /**
   * Windows split mode: the process allow-list (compiled to PROCESS-NAME rules,
   * direct-default — only the listed apps tunnel). When ABSENT (Android — apps
   * are gated natively by VpnService), split keeps its proxy-default semantics
   * (everything inside the tunnel is proxied).
   */
  splitProcesses?: readonly string[]
}

// Build a minimal engine policy for the modes that normally run on legacy rules
// (full/split, custom-with-no-scenarios). Only used when the user has custom
// rules — with none, those modes keep policy=null and the legacy path,
// byte-identical to before this feature.
function minimalPolicy(
  mode: 'full' | 'split' | 'custom',
  defaultAction: 'proxy' | 'direct',
  userRules: readonly RoutingRule[],
  processRules: readonly RoutingRule[] = [],
): ComposeRoutingResult {
  const policy: RoutingPolicy = {
    mode,
    defaultAction,
    processRules,
    userRules,
    providerRules: privateDirectRules(),
    geoRules: [],
  }
  const result = pipeline.process(policy)
  if (!result.validation.valid) {
    // Never let a bad user rule kill the connection — fall back to legacy rules.
    return { policy: null, warnings: [], valid: false, errors: result.validation.errors.map((e) => e.message) }
  }
  return { policy: result.policy, warnings: [], valid: true, errors: [] }
}

export function resolveRoutingPolicyForMode(
  mode: VPNMode,
  enabledScenarios: readonly string[],
  opts: ResolveRoutingOptions = {},
): ComposeRoutingResult {
  const userRules = toUserRoutingRules(opts.customRules ?? [])

  switch (mode) {
    case 'full':
      // No user rules → legacy full-tunnel rules (policy null, unchanged).
      // With user rules → minimal policy replicating legacy full (private nets
      // DIRECT + MATCH→proxy) with the overrides on top.
      return userRules.length === 0
        ? { policy: null, warnings: [], valid: true, errors: [] }
        : minimalPolicy('full', 'proxy', userRules)
    case 'split': {
      if (userRules.length === 0) {
        return { policy: null, warnings: [], valid: true, errors: [] }
      }
      // Windows (splitProcesses provided): PROCESS-NAME allow-list, MATCH→DIRECT
      // — replicates legacy split. Android (no splitProcesses): apps are selected
      // natively, in-tunnel traffic keeps its proxy-default (legacy 'global').
      if (opts.splitProcesses !== undefined) {
        const processRules: RoutingRule[] = opts.splitProcesses.map((p, i) => ({
          id: `split:${p}`,
          target: { type: 'process_name' as const, value: p },
          action: 'proxy' as const,
          priority: 10 + i,
          source: { provider: 'split-tunnel' },
        }))
        return minimalPolicy('split', 'direct', userRules, processRules)
      }
      return minimalPolicy('split', 'proxy', userRules)
    }
    case 'bypass':
      return composeRoutingPolicy(BYPASS_SCENARIOS, userRules)
    case 'blocked':
      return composeRoutingPolicy(BLOCKED_ONLY_SCENARIOS, userRules)
    case 'custom':
    default: {
      // Custom with zero valid scenarios + user rules: legacy custom is
      // MATCH→proxy, so replicate that (private DIRECT + rules + proxy default).
      const ids = validScenarioIds(enabledScenarios)
      if (ids.length === 0 && userRules.length > 0) {
        return minimalPolicy('custom', 'proxy', userRules)
      }
      return composeRoutingPolicy(enabledScenarios, userRules)
    }
  }
}
