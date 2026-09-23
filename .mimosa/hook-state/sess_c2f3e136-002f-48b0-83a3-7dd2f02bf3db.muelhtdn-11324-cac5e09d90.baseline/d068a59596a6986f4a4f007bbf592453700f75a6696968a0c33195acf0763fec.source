import type { RoutingRule } from '../models/RoutingRule'

/**
 * Curated «messengers → proxy» list so voice/video CALLS work in Russia, where the
 * RKN throttles WhatsApp/Telegram/Signal media. The default mode «Только
 * заблокированное» (smart-russia-bypass) routes everything DIRECT unless a rule
 * proxies it — WhatsApp was missing entirely, so its calls dialed DIRECT and got
 * throttled (device log: `api.whatsapp.net:443` DIRECT-timeout). This module makes
 * the major messengers go through the VPN on BOTH bypass bases.
 *
 * Two target kinds per app, because call MEDIA travels to raw IPs (no DNS to match
 * a domain rule):
 *   - `geosite:<app>` + a few `domain_suffix` — the signalling / chat domains.
 *   - `geoip:<provider>` (no-resolve) — the call-media IP ranges the app dials
 *     directly. WhatsApp media rides Meta's network → `geoip:facebook`; Telegram
 *     voice rides its DCs → `geoip:telegram`. Verified present in the shipped
 *     geoip.dat via `mihomo -t` (facebook: 108 records, telegram: 12).
 *
 * Priority 1300-1399 — inside the proxy band, BEFORE the curated RU-direct
 * (2400) and `geoip:RU` (2500), so a messenger domain/IP is tunnelled regardless
 * of where its CDN resolves. The geoip categories are Meta/Telegram ranges (non-RU),
 * so they never collide with the RU-direct banking/gov allow-list.
 *
 * FaceTime is intentionally omitted: there is no `facetime` geosite category in the
 * shipped dat, and Apple is routed DIRECT on the bypass base — proxying it would
 * risk iMessage / App Store. Not blocked in RU anyway.
 */

let _priority = 1300

function rule(
  type: RoutingRule['target']['type'],
  value: string,
  category: string,
  noResolve = false,
): RoutingRule {
  return {
    id: `messenger:${type}:${value}`,
    target: { type, value },
    action: 'proxy',
    priority: _priority++,
    source: { provider: 'messengers', category },
    ...(noResolve ? { noResolve: true } : {}),
  }
}

function geosite(value: string, category: string): RoutingRule {
  return rule('geosite', value, category)
}
function suffix(value: string, category: string): RoutingRule {
  return rule('domain_suffix', value, category)
}
function geoip(value: string, category: string): RoutingRule {
  return rule('geoip', value, category, true)
}

// ─── WhatsApp (chat + calls; media on Meta's network) ───────────────────────────
const WHATSAPP: readonly RoutingRule[] = [
  geosite('whatsapp', 'whatsapp'),
  suffix('whatsapp.net', 'whatsapp'),
  suffix('whatsapp.com', 'whatsapp'),
  geoip('facebook', 'whatsapp'), // call media + FB/Instagram IPs (Meta AS32934)
]

// ─── Telegram (chat + voice; voice rides the DC IPs directly) ───────────────────
const TELEGRAM: readonly RoutingRule[] = [
  geosite('telegram', 'telegram'),
  geoip('telegram', 'telegram'),
]

// ─── Signal ─────────────────────────────────────────────────────────────────────
const SIGNAL: readonly RoutingRule[] = [
  geosite('signal', 'signal'),
  suffix('signal.org', 'signal'),
  suffix('whispersystems.org', 'signal'),
  suffix('signal.group', 'signal'),
]

// ─── Discord (text + voice; voice is UDP to discord.media / regional IPs) ────────
const DISCORD: readonly RoutingRule[] = [
  geosite('discord', 'discord'),
  suffix('discord.com', 'discord'),
  suffix('discord.gg', 'discord'),
  suffix('discord.media', 'discord'),
  suffix('discordapp.com', 'discord'),
  suffix('discordapp.net', 'discord'),
]

// ─── Viber ───────────────────────────────────────────────────────────────────────
const VIBER: readonly RoutingRule[] = [
  geosite('viber', 'viber'),
  suffix('viber.com', 'viber'),
]

/**
 * All major messengers → proxy. Woven into the bypass base scenarios
 * (SmartRussiaBypass for «Только заблокированное», RoscomVPNDefault for «Обход») so
 * calls work in the default mode without the user switching anything.
 */
export const MESSENGER_PROXY_RULES: readonly RoutingRule[] = [
  ...WHATSAPP,
  ...TELEGRAM,
  ...SIGNAL,
  ...DISCORD,
  ...VIBER,
]
