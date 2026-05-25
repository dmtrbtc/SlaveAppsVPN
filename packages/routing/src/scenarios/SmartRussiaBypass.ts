import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import { RUSSIA_BYPASS_RULES, RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import type { RoutingScenario } from './types'

// Russia-specific direct routes for local services that MUST stay direct
// (otherwise banking apps, gosuslugi, etc. break or trigger fraud detection).
const RUSSIA_LOCAL_DIRECT_DOMAINS: readonly string[] = [
  // Banking
  'sberbank.ru', 'sber.ru', 'sbrf.ru', 'sberbank-online.ru', 'online.sberbank.ru',
  'vtb.ru', 'tinkoff.ru', 'tcsbank.ru', 'tbank.ru',
  'alfabank.ru', 'gazprombank.ru', 'rshb.ru', 'open.ru',
  'raiffeisen.ru', 'mkb.ru', 'rosbank.ru', 'pochtabank.ru',
  // Government
  'gosuslugi.ru', 'gosuslugi.ru', 'rosreestr.ru', 'nalog.ru', 'pfr.gov.ru',
  'mos.ru', 'mosreg.ru', 'fssp.gov.ru', 'gibdd.ru',
  // Russian search & email
  'yandex.ru', 'yandex.net', 'yandex.com', 'ya.ru',
  'mail.ru', 'list.ru', 'inbox.ru', 'bk.ru',
  'rambler.ru', 'sputnik.ru',
  // Russian social
  'vk.com', 'vk.ru', 'vkontakte.ru', 'ok.ru', 'odnoklassniki.ru',
  // Russian marketplaces
  'wildberries.ru', 'ozon.ru', 'avito.ru', 'aliexpress.ru', 'youla.ru',
  'lamoda.ru', 'mvideo.ru', 'eldorado.ru', 'dns-shop.ru', 'citilink.ru',
  // Russian delivery
  'dostavista.ru', 'cdek.ru', 'pochta.ru', 'russianpost.ru',
  // Russian utilities/media
  'rt.com', 'ria.ru', 'tass.ru', 'kommersant.ru', 'rbc.ru', 'lenta.ru',
  'kinopoisk.ru', 'ivi.ru', 'okko.tv', 'wink.ru', 'more.tv', 'amediateka.ru',
  // Russian tech
  'habr.com', 'tinkoff.ru', '1c.ru', 'kontur.ru',
]

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number, category: string, noResolve = false): RoutingRule {
  return {
    id: nextId(`russia:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:smart-russia-bypass', category },
    ...(noResolve ? { noResolve: true } : {}),
  }
}

function buildRules(): readonly RoutingRule[] {
  const rules: RoutingRule[] = []

  // Priority 100-499: private nets stay direct (must be first)
  let p = 100
  for (const r of RUSSIA_BYPASS_PRIVATE_DIRECT) {
    rules.push({ ...r, priority: p++ })
  }

  // Priority 500-999: Russia local services → direct
  p = 500
  for (const domain of RUSSIA_LOCAL_DIRECT_DOMAINS) {
    rules.push(rule('domain_suffix', domain, 'direct', p++, 'ru-local'))
  }

  // Priority 1500-1999: Blocked-in-RU services → proxy
  // Reuse the existing curated list, reassigning priorities
  p = 1500
  for (const r of RUSSIA_BYPASS_RULES) {
    rules.push({ ...r, priority: p++, source: { provider: 'scenario:smart-russia-bypass', category: 'blocked-in-ru' } })
  }

  // Priority 2500-2999: Geo-based — RU geoip → direct (catches the long tail of RU services)
  rules.push({
    id: nextId('russia:geoip:RU'),
    target: { type: 'geoip', value: 'RU' },
    action: 'direct',
    priority: 2500,
    noResolve: true,
    source: { provider: 'scenario:smart-russia-bypass', category: 'geoip' },
  })

  return rules
}

export function createSmartRussiaBypassScenario(): RoutingScenario {
  return {
    id: 'smart-russia-bypass',
    name: 'Smart Russia Bypass',
    description: 'Заблокированное в РФ — через VPN. Российские сервисы и банки — напрямую.',
    category: 'bypass',
    icon: 'Map',
    defaultEnabled: true,
    composable: true,
    rules: buildRules(),
    defaultAction: 'direct',
  }
}
