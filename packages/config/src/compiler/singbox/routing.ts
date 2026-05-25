import type { NormalizedPolicy } from '@slave-vpn/routing'
import type { RoutingRule, RuleAction, RuleTargetType } from '@slave-vpn/routing'
import type { SingboxRouteRule } from './types'

function actionToOutbound(action: RuleAction, selectGroup: string): string {
  switch (action) {
    case 'proxy':  return selectGroup
    case 'direct': return 'direct'
    case 'reject': return 'block'
  }
}

// Map a single internal RoutingRule → sing-box rule.
// sing-box supports rich rule composition; we emit one field per rule for clarity.
function compileRule(rule: RoutingRule, selectGroup: string): SingboxRouteRule | null {
  const outbound = actionToOutbound(rule.action, selectGroup)
  const v = rule.target.value
  const type: RuleTargetType = rule.target.type

  switch (type) {
    case 'domain':         return { domain: [v], outbound }
    case 'domain_suffix':  return { domain_suffix: [v], outbound }
    case 'domain_keyword': return { domain_keyword: [v], outbound }
    case 'ip_cidr':        return { ip_cidr: [v], outbound }
    case 'geoip':          return { geoip: v.toLowerCase(), outbound }
    case 'geosite':        return { geosite: v.toLowerCase(), outbound }
    case 'process_name':   return { process_name: [v], outbound }
    case 'port': {
      const port = Number(v)
      if (Number.isFinite(port)) return { port: [port], outbound }
      return null
    }
    default:
      return null
  }
}

// Collapse adjacent rules that share the same target type AND outbound into a
// single rule with an array. Reduces rule count from hundreds to dozens, which
// is the right shape for sing-box rule matching.
function collapseRules(rules: SingboxRouteRule[]): SingboxRouteRule[] {
  const out: SingboxRouteRule[] = []

  type Bucket = { key: string; rule: SingboxRouteRule }
  let bucket: Bucket | null = null

  const fieldKey = (r: SingboxRouteRule): string | null => {
    if (r.domain_suffix) return 'domain_suffix'
    if (r.domain) return 'domain'
    if (r.domain_keyword) return 'domain_keyword'
    if (r.ip_cidr) return 'ip_cidr'
    if (r.process_name) return 'process_name'
    if (r.port) return 'port'
    return null  // single-value (geoip / geosite) — can't merge
  }

  for (const r of rules) {
    const field = fieldKey(r)
    if (!field) {
      if (bucket) { out.push(bucket.rule); bucket = null }
      out.push(r)
      continue
    }

    const key = `${field}|${r.outbound}|${r.network ?? ''}`
    if (bucket && bucket.key === key) {
      // Merge into existing bucket
      const target = bucket.rule as unknown as Record<string, unknown[]>
      const arr = target[field]
      const next = (r as unknown as Record<string, unknown[]>)[field]
      if (Array.isArray(arr) && Array.isArray(next)) arr.push(...next)
    } else {
      if (bucket) out.push(bucket.rule)
      // Clone so we don't mutate the input
      bucket = { key, rule: { ...r } }
    }
  }

  if (bucket) out.push(bucket.rule)
  return out
}

export function compileRoutingRules(policy: NormalizedPolicy | undefined, selectGroup: string): {
  rules: SingboxRouteRule[]
  finalOutbound: string
} {
  const compiled: SingboxRouteRule[] = []

  if (policy) {
    for (const rule of policy.rules) {
      const r = compileRule(rule, selectGroup)
      if (r) compiled.push(r)
    }
  }

  const finalAction = policy?.defaultAction ?? 'proxy'
  const finalOutbound = actionToOutbound(finalAction, selectGroup)

  return {
    rules: collapseRules(compiled),
    finalOutbound,
  }
}

// Default rules ensuring private/loopback never tunnel, even if no policy provided.
export const PRIVATE_DIRECT_RULES: readonly SingboxRouteRule[] = [
  { ip_cidr: ['127.0.0.0/8', '::1/128'], outbound: 'direct' },
  { ip_cidr: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', 'fc00::/7'], outbound: 'direct' },
  { ip_cidr: ['224.0.0.0/4', '240.0.0.0/4'], outbound: 'direct' },
]
