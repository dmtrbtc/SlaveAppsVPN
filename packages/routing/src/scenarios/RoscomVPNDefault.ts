import type { RoutingRule } from '../models/RoutingRule'
import { RUSSIA_BYPASS_PRIVATE_DIRECT } from '../data/bypass-rules'
import type { RoutingScenario } from './types'

/**
 * RoscomVPN Default — translated from hydraponique/roscomvpn-routing
 * MIHOMO/default.yaml. RU/BY-optimised:
 *   • REJECT  — ads, Windows telemetry, public torrent DHT
 *   • PROXY   — YouTube, Telegram, GitHub, Google Play, twitch-ads
 *   • DIRECT  — RU/BY domains, banks, gaming platforms (Steam/EpicGames/Riot/
 *              EFT/Faceit), Microsoft, Apple, Twitch, Pinterest, RU CDNs
 *   • final   — PROXY (everything else)
 *
 * Categories that exist in the standard MetaCubeX/V2Ray geosite.dat are
 * referenced directly (youtube, telegram, github, microsoft, apple, steam,
 * twitch, pinterest, category-ru). RoscomVPN-only categories
 * (whitelist, win-spy, twitch-ads, faceit, escapefromtarkov, ru-apps) are
 * resolved only when the user has geosite-roscomvpn.dat installed via
 * GeoUpdater. With the standard geosite.dat they're silently no-ops, which
 * is fine — the rest of the chain still produces a usable RU bypass.
 */

let _id = 0
function nextId(suffix: string): string {
  return `roscomvpn:${suffix}:${++_id}`
}

function buildRules(): readonly RoutingRule[] {
  const rules: RoutingRule[] = []
  let p = 100

  // Private nets first — RFC1918, loopback, link-local
  for (const r of RUSSIA_BYPASS_PRIVATE_DIRECT) {
    rules.push({ ...r, priority: p++ })
  }

  // ─── REJECT ─────────────────────────────────────────────────────────────
  // Ads, telemetry, torrent DHT (priority 200-299)
  p = 200
  for (const cat of ['category-ads', 'category-ads-all', 'win-spy', 'torrent']) {
    rules.push({
      id: nextId(`geosite:${cat}:reject`),
      target: { type: 'geosite', value: cat },
      action: 'reject',
      priority: p++,
      source: { provider: 'scenario:roscomvpn-default', category: 'block' },
    })
  }

  // ─── PROXY (the blocked-in-RU bunch) ────────────────────────────────────
  // Priority 300-399
  p = 300
  for (const cat of ['youtube', 'telegram', 'github', 'google-play', 'twitch-ads']) {
    rules.push({
      id: nextId(`geosite:${cat}:proxy`),
      target: { type: 'geosite', value: cat },
      action: 'proxy',
      priority: p++,
      source: { provider: 'scenario:roscomvpn-default', category: 'proxy' },
    })
  }

  // ─── DIRECT (RU services, gaming, OS vendors) ───────────────────────────
  // Priority 400-599
  p = 400
  const DIRECT_CATEGORIES = [
    'microsoft',
    'apple',
    'steam',
    'epicgames',
    'origin',
    'riot',
    'escapefromtarkov',
    'faceit',
    'twitch',
    'pinterest',
    'category-ru',
    'whitelist',
  ]
  for (const cat of DIRECT_CATEGORIES) {
    rules.push({
      id: nextId(`geosite:${cat}:direct`),
      target: { type: 'geosite', value: cat },
      action: 'direct',
      priority: p++,
      source: { provider: 'scenario:roscomvpn-default', category: 'direct' },
    })
  }

  // ─── geoip:RU → DIRECT (long tail not in geosite) ───────────────────────
  rules.push({
    id: nextId('geoip:RU:direct'),
    target: { type: 'geoip', value: 'RU' },
    action: 'direct',
    priority: 2500,
    noResolve: true,
    source: { provider: 'scenario:roscomvpn-default', category: 'geoip-ru' },
  })

  return rules
}

export function createRoscomVPNDefaultScenario(): RoutingScenario {
  return {
    id: 'roscomvpn-default',
    name: 'RoscomVPN Default',
    description:
      'Готовый РФ/BY профиль (hydraponique/roscomvpn-routing): YouTube/Telegram/GitHub через прокси, ' +
      'РФ домены и банки/игры напрямую, реклама и слежка Windows блокируются. Final → proxy.',
    category: 'bypass',
    icon: 'ShieldCheck',
    // The out-of-box default: proxy-everything-not-RU is what users expect from a
    // RU-bypass VPN (blocked sites tunnel automatically, RU stays on a RU IP).
    // This is the config validated working on Windows (alpha.7).
    defaultEnabled: true,
    composable: false, // overrides default — full bypass profile
    rules: buildRules(),
    defaultAction: 'proxy', // everything not matched goes through VPN
  }
}
