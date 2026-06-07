import type { RoutingRule } from '../models/RoutingRule'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import type { RoutingScenario } from './types'

// Curated category names from runetfreedom/russia-blocked-geosite.
// These are referenced as `geosite:<cat>` in rules — the engine looks them
// up in the bundled or auto-updated geosite-runetfreedom.dat / geosite.dat.
const RUNETFREEDOM_CATEGORIES: readonly string[] = [
  'ru-blocked',         // primary blocked-in-RU domain set
  'antifilter-community',
  'refilter',
  'youtube',
  'discord',
  'category-ads-all',   // ads — typically REJECT, but we route through VPN
                        // so request never reaches ad networks at all
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
    description: 'Списки runetfreedom: ru-blocked, antifilter, refilter, youtube, discord. Авто-обновляются.',
    category: 'bypass',
    icon: 'ShieldCheck',
    defaultEnabled: false,
    composable: true,  // can stack with Smart Russia Bypass — finer-grained
    rules: buildRules(),
    defaultAction: null,  // doesn't override default — works alongside other scenarios
  }
}
