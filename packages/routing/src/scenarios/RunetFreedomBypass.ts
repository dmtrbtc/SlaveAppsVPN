import type { RoutingRule } from '../models/RoutingRule'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import type { RoutingScenario } from './types'

// Category names referenced as `geosite:<cat>`. The engine resolves these
// against the geosite.dat it loads; on mihomo the runtime MERGES
// geosite-runetfreedom.dat into that file (see MihomoEngine.syncGeoSiteWithMerge),
// so the RuNet-only `ru-blocked` set resolves alongside the MetaCubeX defaults.
//
// Any category absent from the loaded dat is dropped by the safety-net filter
// (filterUnknownGeoSiteRules) instead of crashing mihomo — that's intentional:
//   • ru-blocked ........ RuNet dat (merged) — the PRIMARY RKN-blocked set
//   • youtube / discord . MetaCubeX geosite.dat
//   • category-ads-all .. both (ads — routed through VPN so the request never
//                         reaches ad networks at all)
//   • antifilter-community / refilter — NOT shipped as geosite categories (they
//     live only as upstream .txt lists, whose domains ru-blocked already
//     aggregates). Kept as forward-compat: light up automatically if a future
//     dat adds them, otherwise filtered out as no-ops.
const RUNETFREEDOM_CATEGORIES: readonly string[] = [
  'ru-blocked',
  'antifilter-community',
  'refilter',
  'youtube',
  'discord',
  'category-ads-all',
]

let _id = 0
function nextId(suffix: string): string {
  return `runetfreedom:${suffix}:${++_id}`
}

function buildRules(): readonly RoutingRule[] {
  const rules: RoutingRule[] = []

  // Private nets first — same as other RU scenarios
  let p = 100
  for (const r of RUSSIA_BYPASS_PRIVATE_DIRECT) {
    rules.push({ ...r, priority: p++ })
  }

  // RuNet Freedom geosite categories → proxy
  // Priority 1300-1399 — runs before the legacy Russia Bypass list (1500+)
  p = 1300
  for (const cat of RUNETFREEDOM_CATEGORIES) {
    rules.push({
      id: nextId(`geosite:${cat}`),
      target: { type: 'geosite', value: cat },
      action: 'proxy',
      priority: p++,
      source: { provider: 'scenario:runetfreedom-bypass', category: 'blocked-by-russia' },
    })
  }

  // RU geoip → direct (catches the long tail not in geosite)
  rules.push({
    id: nextId('geoip:RU'),
    target: { type: 'geoip', value: 'RU' },
    action: 'direct',
    priority: 2500,
    noResolve: true,
    source: { provider: 'scenario:runetfreedom-bypass', category: 'geoip' },
  })

  return rules
}

export function createRunetFreedomBypassScenario(): RoutingScenario {
  return {
    id: 'runetfreedom-bypass',
    name: 'RuNet Freedom Bypass',
    description: 'Заблокированные сайты, YouTube и Discord через VPN. Geosite обновляется автоматически.',
    category: 'bypass',
    icon: 'ShieldCheck',
    defaultEnabled: false,
    composable: true,  // can stack with Smart Russia Bypass — finer-grained
    rules: buildRules(),
    defaultAction: null,  // doesn't override default — works alongside other scenarios
  }
}
