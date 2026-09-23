import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import type { RoutingScenario } from './types'

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number, category: string, noResolve = false): RoutingRule {
  return {
    id: nextId(`global:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:smart-global', category },
    ...(noResolve ? { noResolve: true } : {}),
  }
}

// Domains that should be excluded from the global proxy
// (banks/government/etc. where proxy IP triggers fraud detection).
const KEEP_DIRECT_DOMAINS: readonly string[] = [
  // Russian banks (anti-fraud)
  'sberbank.ru', 'tinkoff.ru', 'tbank.ru', 'vtb.ru', 'alfabank.ru', 'gazprombank.ru',
  // Russian government
  'gosuslugi.ru', 'nalog.ru', 'mos.ru', 'rosreestr.ru',
  // Updates / Telemetry that benefit from local
  'windowsupdate.com', 'update.microsoft.com',
]

function buildRules(): readonly RoutingRule[] {
  const rules: RoutingRule[] = []
  let p = 100
  for (const r of RUSSIA_BYPASS_PRIVATE_DIRECT) {
    rules.push({ ...r, priority: p++ })
  }
  p = 600
  for (const d of KEEP_DIRECT_DOMAINS) {
    rules.push(rule('domain_suffix', d, 'direct', p++, 'keep-direct'))
  }
  return rules
}

export function createSmartGlobalScenario(): RoutingScenario {
  return {
    id: 'smart-global',
    name: 'Smart Global',
    description: 'Всё через VPN. Локальные сервисы и банки — исключения.',
    category: 'bypass',
    icon: 'Globe',
    defaultEnabled: false,
    composable: false,        // mutually exclusive with smart-russia-bypass
    rules: buildRules(),
    defaultAction: 'proxy',
  }
}
