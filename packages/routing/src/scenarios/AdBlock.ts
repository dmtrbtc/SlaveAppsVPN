import type { RoutingRule, RuleTargetType, RuleAction } from '../models/RoutingRule'
import type { RoutingScenario } from './types'

// Curated ad / tracker / telemetry domain list — extended from EasyList top entries.
// Composable with bypass scenarios; rules execute before bypass thanks to lower priority.
const AD_TRACKER_DOMAINS: readonly string[] = [
  // Google Ads
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
  'googletagmanager.com', 'googletagservices.com',
  '2mdn.net', 'g.doubleclick.net',
  // Facebook tracking
  'connect.facebook.net',
  // Yandex Metrika
  'mc.yandex.ru', 'metrika.yandex.ru',
  // Major ad networks
  'adnxs.com', 'adsystem.com', 'adsrvr.org', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'mgid.com', 'propellerads.com',
  'adcolony.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'media.net', 'amazon-adsystem.com', 'serving-sys.com',
  // Trackers
  'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mouseflow.com',
  'fullstory.com', 'logrocket.com', 'segment.com', 'mixpanel.com',
  'amplitude.com', 'heap.io', 'kissmetrics.io',
  // Telemetry
  'crashlytics.com', 'sentry.io', 'bugsnag.com', 'rollbar.com',
  // Adult / malware adjacent
  'popads.net', 'popcash.net', 'mgid.com', 'revcontent.com',
  // Microsoft telemetry
  'vortex.data.microsoft.com', 'telemetry.microsoft.com',
  // Mobile ads
  'applovin.com', 'unityads.unity3d.com', 'chartboost.com', 'admost.com',
  'mopub.com', 'inmobi.com', 'startapp.com', 'adcolony.com',
]

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}:${++_id}`
}

function rule(type: RuleTargetType, value: string, action: RuleAction, priority: number): RoutingRule {
  return {
    id: nextId(`adblock:${type}:${value}`),
    target: { type, value },
    action,
    priority,
    source: { provider: 'scenario:ad-block', category: 'ad-tracker' },
  }
}

function buildRules(): readonly RoutingRule[] {
  // Priority 700-799: ad-blocking comes before regular bypass rules (1500+)
  // but after private-nets (100-499). REJECT drops the request.
  let p = 700
  return AD_TRACKER_DOMAINS.map(d => rule('domain_suffix', d, 'reject', p++))
}

export function createAdBlockScenario(): RoutingScenario {
  return {
    id: 'ad-block',
    name: 'Ad Block',
    description: 'Блокирует рекламу, трекеры и телеметрию на DNS-уровне.',
    category: 'block',
    icon: 'ShieldOff',
    defaultEnabled: false,
    composable: true,
    rules: buildRules(),
    defaultAction: null,
  }
}
