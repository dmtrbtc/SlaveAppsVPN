import type { Server } from '@slave-vpn/shared'
import type { ProxyEntry } from '@slave-vpn/config'
import { buildAggregatedProxies } from './aggregator'

/**
 * Renderer-side server-list builder for Android.
 *
 * On Windows the server list is produced by the main process
 * (servers.handler.ts → ConfigSourceService.getServerList). Android has no
 * main process, so we reproduce the same shape here: fetch + dedup nodes via
 * the aggregator, then map each ProxyEntry → Server (with country detection
 * from the node name, mirroring servers.handler.ts).
 *
 * A short in-memory cache avoids re-fetching every subscription on each poll
 * of the ServersPage (it lists on mount + on focus). The cache is cleared
 * when a subscription is added/removed (see bridge.ts).
 */

interface CountryInfo { code: string; name: string; flag: string }

// Mirror of servers.handler.ts COUNTRY_KEYWORDS (kept in sync manually — the
// main-process table can't be imported into the renderer bundle).
const COUNTRY_KEYWORDS: [string, CountryInfo][] = [
  ['russia', { code: 'RU', name: 'Россия', flag: '🇷🇺' }],
  ['moscow', { code: 'RU', name: 'Россия', flag: '🇷🇺' }],
  ['spb', { code: 'RU', name: 'Россия', flag: '🇷🇺' }],
  ['-ru-', { code: 'RU', name: 'Россия', flag: '🇷🇺' }],
  ['нидерланды', { code: 'NL', name: 'Нидерланды', flag: '🇳🇱' }],
  ['netherlands', { code: 'NL', name: 'Нидерланды', flag: '🇳🇱' }],
  ['amsterdam', { code: 'NL', name: 'Нидерланды', flag: '🇳🇱' }],
  ['-nl-', { code: 'NL', name: 'Нидерланды', flag: '🇳🇱' }],
  ['germany', { code: 'DE', name: 'Германия', flag: '🇩🇪' }],
  ['frankfurt', { code: 'DE', name: 'Германия', flag: '🇩🇪' }],
  ['-de-', { code: 'DE', name: 'Германия', flag: '🇩🇪' }],
  ['finland', { code: 'FI', name: 'Финляндия', flag: '🇫🇮' }],
  ['helsinki', { code: 'FI', name: 'Финляндия', flag: '🇫🇮' }],
  ['-fi-', { code: 'FI', name: 'Финляндия', flag: '🇫🇮' }],
  ['poland', { code: 'PL', name: 'Польша', flag: '🇵🇱' }],
  ['warsaw', { code: 'PL', name: 'Польша', flag: '🇵🇱' }],
  ['-pl-', { code: 'PL', name: 'Польша', flag: '🇵🇱' }],
  ['france', { code: 'FR', name: 'Франция', flag: '🇫🇷' }],
  ['paris', { code: 'FR', name: 'Франция', flag: '🇫🇷' }],
  ['-fr-', { code: 'FR', name: 'Франция', flag: '🇫🇷' }],
  ['britain', { code: 'GB', name: 'Великобритания', flag: '🇬🇧' }],
  ['london', { code: 'GB', name: 'Великобритания', flag: '🇬🇧' }],
  ['-uk-', { code: 'GB', name: 'Великобритания', flag: '🇬🇧' }],
  ['-gb-', { code: 'GB', name: 'Великобритания', flag: '🇬🇧' }],
  ['lithuania', { code: 'LT', name: 'Литва', flag: '🇱🇹' }],
  ['vilnius', { code: 'LT', name: 'Литва', flag: '🇱🇹' }],
  ['-lt-', { code: 'LT', name: 'Литва', flag: '🇱🇹' }],
  ['usa', { code: 'US', name: 'США', flag: '🇺🇸' }],
  ['new york', { code: 'US', name: 'США', flag: '🇺🇸' }],
  ['new-york', { code: 'US', name: 'США', flag: '🇺🇸' }],
  ['-us-', { code: 'US', name: 'США', flag: '🇺🇸' }],
  ['singapore', { code: 'SG', name: 'Сингапур', flag: '🇸🇬' }],
  ['-sg-', { code: 'SG', name: 'Сингапур', flag: '🇸🇬' }],
  ['turkey', { code: 'TR', name: 'Турция', flag: '🇹🇷' }],
  ['istanbul', { code: 'TR', name: 'Турция', flag: '🇹🇷' }],
  ['-tr-', { code: 'TR', name: 'Турция', flag: '🇹🇷' }],
  ['ukraine', { code: 'UA', name: 'Украина', flag: '🇺🇦' }],
  ['-ua-', { code: 'UA', name: 'Украина', flag: '🇺🇦' }],
  ['sweden', { code: 'SE', name: 'Швеция', flag: '🇸🇪' }],
  ['stockholm', { code: 'SE', name: 'Швеция', flag: '🇸🇪' }],
  ['-se-', { code: 'SE', name: 'Швеция', flag: '🇸🇪' }],
  ['japan', { code: 'JP', name: 'Япония', flag: '🇯🇵' }],
  ['tokyo', { code: 'JP', name: 'Япония', flag: '🇯🇵' }],
  ['-jp-', { code: 'JP', name: 'Япония', flag: '🇯🇵' }],
  ['switzerland', { code: 'CH', name: 'Швейцария', flag: '🇨🇭' }],
  ['zurich', { code: 'CH', name: 'Швейцария', flag: '🇨🇭' }],
  ['-ch-', { code: 'CH', name: 'Швейцария', flag: '🇨🇭' }],
  ['austria', { code: 'AT', name: 'Австрия', flag: '🇦🇹' }],
  ['vienna', { code: 'AT', name: 'Австрия', flag: '🇦🇹' }],
  ['czechia', { code: 'CZ', name: 'Чехия', flag: '🇨🇿' }],
  ['prague', { code: 'CZ', name: 'Чехия', flag: '🇨🇿' }],
  ['bulgaria', { code: 'BG', name: 'Болгария', flag: '🇧🇬' }],
  ['moldova', { code: 'MD', name: 'Молдова', flag: '🇲🇩' }],
  ['latvia', { code: 'LV', name: 'Латвия', flag: '🇱🇻' }],
  ['estonia', { code: 'EE', name: 'Эстония', flag: '🇪🇪' }],
  ['norway', { code: 'NO', name: 'Норвегия', flag: '🇳🇴' }],
  ['denmark', { code: 'DK', name: 'Дания', flag: '🇩🇰' }],
  ['canada', { code: 'CA', name: 'Канада', flag: '🇨🇦' }],
  ['toronto', { code: 'CA', name: 'Канада', flag: '🇨🇦' }],
  ['-ca-', { code: 'CA', name: 'Канада', flag: '🇨🇦' }],
  ['australia', { code: 'AU', name: 'Австралия', flag: '🇦🇺' }],
  ['sydney', { code: 'AU', name: 'Австралия', flag: '🇦🇺' }],
  ['hong kong', { code: 'HK', name: 'Гонконг', flag: '🇭🇰' }],
  ['hongkong', { code: 'HK', name: 'Гонконг', flag: '🇭🇰' }],
  ['-hk-', { code: 'HK', name: 'Гонконг', flag: '🇭🇰' }],
]

function detectCountry(name: string, server: string): CountryInfo {
  const haystack = `${name} ${server}`.toLowerCase()
  for (const [keyword, info] of COUNTRY_KEYWORDS) {
    if (haystack.includes(keyword)) return info
  }
  return { code: 'UN', name: 'Неизвестно', flag: '🌐' }
}

function toServer(proxy: ProxyEntry, idx: number): Server {
  const country = detectCountry(proxy.name, proxy.server)
  return {
    id: proxy.name || String(idx + 1),
    name: proxy.name,
    countryCode: country.code,
    countryName: country.name,
    flagEmoji: country.flag,
    availability: 'online',
    latencyMs: null,
    isFavorite: false,
    isSelected: false,
    ...(proxy.type ? { proxyType: proxy.type } : {}),
    ...(proxy.transport ? { transport: proxy.transport } : {}),
    ...(proxy.securityType ? { securityType: proxy.securityType } : {}),
  }
}

// ─── Short cache so a ServersPage poll doesn't re-fetch every subscription ────

const CACHE_TTL_MS = 60_000
let cache: { at: number; servers: Server[] } | null = null

export function invalidateServerCache(): void {
  cache = null
}

export async function listAndroidServers(): Promise<Server[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.servers
  const { proxies } = await buildAggregatedProxies()
  const servers = proxies.map(toServer)
  cache = { at: Date.now(), servers }
  return servers
}
