import type { Server } from '@slave-vpn/shared'
import { lookup as dnsLookup } from 'node:dns/promises'
import { NodeProber, NodeHealthTracker } from '@slave-vpn/runtime'
import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import type { ServerLatencyPayload } from '../../../shared/ipc/types'
import type { RuntimeService } from '../../services/RuntimeService'
import { handleIpc, services } from '../registry'
import { getConfigSourceService, extractProxiesFromYaml } from '../../services/impl/ConfigSourceService'
import type { ServerListEntry } from '../../services/impl/ConfigSourceService'
import { getSubscriptionStore } from '../../services/SubscriptionStore'
import { getSubscriptionAggregator } from '../../services/SubscriptionAggregatorService'
import { getLogger } from '../../logger'
import { sendToRenderer } from '../../window'

const PROBE_TEST_URL = 'http://www.gstatic.com/generate_204'
const PROBE_TIMEOUT_MS = 5000
const PROBE_CONCURRENCY = 10

// ─── Country detection ────────────────────────────────────────────────────────

interface CountryInfo { code: string; name: string; flag: string }

const COUNTRY_KEYWORDS: [string, CountryInfo][] = [
  ['russia',     { code: 'RU', name: 'Россия',        flag: '🇷🇺' }],
  ['moscow',     { code: 'RU', name: 'Россия',        flag: '🇷🇺' }],
  ['spb',        { code: 'RU', name: 'Россия',        flag: '🇷🇺' }],
  ['-ru-',       { code: 'RU', name: 'Россия',        flag: '🇷🇺' }],
  ['нидерланды', { code: 'NL', name: 'Нидерланды',   flag: '🇳🇱' }],
  ['netherlands',{ code: 'NL', name: 'Нидерланды',   flag: '🇳🇱' }],
  ['amsterdam',  { code: 'NL', name: 'Нидерланды',   flag: '🇳🇱' }],
  ['-nl-',       { code: 'NL', name: 'Нидерланды',   flag: '🇳🇱' }],
  ['germany',    { code: 'DE', name: 'Германия',      flag: '🇩🇪' }],
  ['frankfurt',  { code: 'DE', name: 'Германия',      flag: '🇩🇪' }],
  ['-de-',       { code: 'DE', name: 'Германия',      flag: '🇩🇪' }],
  ['finland',    { code: 'FI', name: 'Финляндия',     flag: '🇫🇮' }],
  ['helsinki',   { code: 'FI', name: 'Финляндия',     flag: '🇫🇮' }],
  ['-fi-',       { code: 'FI', name: 'Финляндия',     flag: '🇫🇮' }],
  ['poland',     { code: 'PL', name: 'Польша',        flag: '🇵🇱' }],
  ['warsaw',     { code: 'PL', name: 'Польша',        flag: '🇵🇱' }],
  ['-pl-',       { code: 'PL', name: 'Польша',        flag: '🇵🇱' }],
  ['france',     { code: 'FR', name: 'Франция',       flag: '🇫🇷' }],
  ['paris',      { code: 'FR', name: 'Франция',       flag: '🇫🇷' }],
  ['-fr-',       { code: 'FR', name: 'Франция',       flag: '🇫🇷' }],
  ['britain',    { code: 'GB', name: 'Великобритания',flag: '🇬🇧' }],
  ['london',     { code: 'GB', name: 'Великобритания',flag: '🇬🇧' }],
  ['uk',         { code: 'GB', name: 'Великобритания',flag: '🇬🇧' }],
  ['-gb-',       { code: 'GB', name: 'Великобритания',flag: '🇬🇧' }],
  ['lithuania',  { code: 'LT', name: 'Литва',         flag: '🇱🇹' }],
  ['vilnius',    { code: 'LT', name: 'Литва',         flag: '🇱🇹' }],
  ['-lt-',       { code: 'LT', name: 'Литва',         flag: '🇱🇹' }],
  ['usa',        { code: 'US', name: 'США',            flag: '🇺🇸' }],
  ['new york',   { code: 'US', name: 'США',            flag: '🇺🇸' }],
  ['new-york',   { code: 'US', name: 'США',            flag: '🇺🇸' }],
  ['-us-',       { code: 'US', name: 'США',            flag: '🇺🇸' }],
  ['singapore',  { code: 'SG', name: 'Сингапур',      flag: '🇸🇬' }],
  ['-sg-',       { code: 'SG', name: 'Сингапур',      flag: '🇸🇬' }],
  ['turkey',     { code: 'TR', name: 'Турция',         flag: '🇹🇷' }],
  ['istanbul',   { code: 'TR', name: 'Турция',         flag: '🇹🇷' }],
  ['-tr-',       { code: 'TR', name: 'Турция',         flag: '🇹🇷' }],
  ['ukraine',    { code: 'UA', name: 'Украина',        flag: '🇺🇦' }],
  ['-ua-',       { code: 'UA', name: 'Украина',        flag: '🇺🇦' }],
  ['sweden',     { code: 'SE', name: 'Швеция',         flag: '🇸🇪' }],
  ['stockholm',  { code: 'SE', name: 'Швеция',         flag: '🇸🇪' }],
  ['-se-',       { code: 'SE', name: 'Швеция',         flag: '🇸🇪' }],
  ['japan',      { code: 'JP', name: 'Япония',         flag: '🇯🇵' }],
  ['tokyo',      { code: 'JP', name: 'Япония',         flag: '🇯🇵' }],
  ['-jp-',       { code: 'JP', name: 'Япония',         flag: '🇯🇵' }],
  ['switzerland',{ code: 'CH', name: 'Швейцария',      flag: '🇨🇭' }],
  ['zurich',     { code: 'CH', name: 'Швейцария',      flag: '🇨🇭' }],
  ['-ch-',       { code: 'CH', name: 'Швейцария',      flag: '🇨🇭' }],
  ['austria',    { code: 'AT', name: 'Австрия',        flag: '🇦🇹' }],
  ['vienna',     { code: 'AT', name: 'Австрия',        flag: '🇦🇹' }],
  ['czechia',    { code: 'CZ', name: 'Чехия',          flag: '🇨🇿' }],
  ['prague',     { code: 'CZ', name: 'Чехия',          flag: '🇨🇿' }],
  ['bulgaria',   { code: 'BG', name: 'Болгария',       flag: '🇧🇬' }],
  ['moldova',    { code: 'MD', name: 'Молдова',        flag: '🇲🇩' }],
  ['latvia',     { code: 'LV', name: 'Латвия',         flag: '🇱🇻' }],
  ['estonia',    { code: 'EE', name: 'Эстония',        flag: '🇪🇪' }],
  ['norway',     { code: 'NO', name: 'Норвегия',       flag: '🇳🇴' }],
  ['denmark',    { code: 'DK', name: 'Дания',          flag: '🇩🇰' }],
  ['canada',     { code: 'CA', name: 'Канада',         flag: '🇨🇦' }],
  ['toronto',    { code: 'CA', name: 'Канада',         flag: '🇨🇦' }],
  ['-ca-',       { code: 'CA', name: 'Канада',         flag: '🇨🇦' }],
  ['australia',  { code: 'AU', name: 'Австралия',      flag: '🇦🇺' }],
  ['sydney',     { code: 'AU', name: 'Австралия',      flag: '🇦🇺' }],
  ['hong kong',  { code: 'HK', name: 'Гонконг',       flag: '🇭🇰' }],
  ['hongkong',   { code: 'HK', name: 'Гонконг',       flag: '🇭🇰' }],
  ['-hk-',       { code: 'HK', name: 'Гонконг',       flag: '🇭🇰' }],
]

// 2-letter ISO code → country info, derived once from the keyword table.
const CODE_TO_INFO: Record<string, CountryInfo> = (() => {
  const m: Record<string, CountryInfo> = {}
  for (const [, info] of COUNTRY_KEYWORDS) if (!m[info.code]) m[info.code] = info
  return m
})()
const CODE_ALIASES: Record<string, string> = { UK: 'GB' }

// Scan a string for a bare 2-letter country code at a word boundary — handles
// names like "Slave-NL 35", "PL-vless", "Slave-EE" that the dash-wrapped keyword
// table misses.
function codeFromTokens(text: string): CountryInfo | null {
  for (const tok of text.toUpperCase().split(/[^A-Z]+/)) {
    if (tok.length !== 2) continue
    const code = CODE_ALIASES[tok] ?? tok
    if (CODE_TO_INFO[code]) return CODE_TO_INFO[code]
  }
  return null
}

function detectCountry(name: string, server: string): CountryInfo {
  const haystack = `${name} ${server}`.toLowerCase()
  for (const [keyword, info] of COUNTRY_KEYWORDS) {
    if (haystack.includes(keyword)) return info
  }
  // Prefer the human name over the server hostname (fewer false positives).
  return codeFromTokens(name) ?? codeFromTokens(server) ?? { code: 'UN', name: 'Неизвестно', flag: '🌐' }
}

// ─── IP-based country geolocation (mirrors the Android servers.ts path) ───────
// The country was guessed from the node NAME; this resolves the real country from
// the server IP/host via a free geoip API (ipwho.is). The API supplies only an
// accurate country_code — we reuse CODE_TO_INFO for the RU label/flag. Name-based
// detection (toServer) stays as the fallback. Cached in-process (host→info) so the
// lookup is a one-time cost; globally capped so a slow API never blocks the list.

const geoCache = new Map<string, CountryInfo | null>()

function normalizeHost(server: string): string {
  return server.replace(/:\d+$/, '').trim()
}

async function lookupCountryByIp(server: string): Promise<CountryInfo | null> {
  const host = normalizeHost(server)
  if (!host) return null
  if (geoCache.has(host)) return geoCache.get(host) ?? null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    // ipwho.is geolocates IPs, not domains — resolve a hostname to an IP first
    // (node can do this natively, unlike the Android renderer which uses DoH).
    let ip = host
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.includes(':')) {
      try { ip = (await dnsLookup(host)).address } catch { geoCache.set(host, null); return null }
    }
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,flag`,
      { signal: ctrl.signal },
    )
    const d = (await res.json()) as { success?: boolean; country?: string; country_code?: string; flag?: { emoji?: string } }
    if (!d || d.success === false || !d.country_code) { geoCache.set(host, null); return null }
    const code = CODE_ALIASES[d.country_code.toUpperCase()] ?? d.country_code.toUpperCase()
    const info = CODE_TO_INFO[code] ?? { code, name: d.country || code, flag: d.flag?.emoji || '🌐' }
    geoCache.set(host, info)
    return info
  } catch {
    return null  // do not cache transient failures
  } finally {
    clearTimeout(timer)
  }
}

async function enrichCountriesByIp(servers: Server[], entries: ServerListEntry[]): Promise<void> {
  const tasks = servers.map(async (srv, i) => {
    const host = entries[i]?.server
    if (!host) return
    const info = await lookupCountryByIp(host)
    if (!info) return
    srv.countryCode = info.code
    srv.countryName = info.name
    srv.flagEmoji = info.flag
  })
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>(r => setTimeout(r, 3000)),
  ])
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function toServer(entry: ServerListEntry): Server {
  const country = detectCountry(entry.name, entry.server)
  return {
    id: entry.id,
    name: entry.name,
    countryCode: country.code,
    countryName: country.name,
    flagEmoji: country.flag,
    availability: 'online' as const,
    latencyMs: null,
    isFavorite: false,
    isSelected: false,
    ...(entry.proxyProtocol ? { proxyType: entry.proxyProtocol } : {}),
    ...(entry.transport ? { transport: entry.transport } : {}),
    ...(entry.securityType ? { securityType: entry.securityType } : {}),
  }
}

// ─── Shared health tracker (survives across probe requests) ───────────────────

const healthTracker = new NodeHealthTracker()

// Server list source of truth. Mirrors the CONNECTION path (RuntimeServiceImpl):
// when the user has enabled multi-subscription entries, the list comes from the
// aggregated snapshot (key + all subscriptions coexist, deduped); otherwise it
// falls back to the single legacy config-source. This is what makes the Windows
// list match what's actually connected and stops a pasted key from "disappearing"
// when a subscription is added.
async function resolveServerListEntries(): Promise<ServerListEntry[]> {
  const hasSubs = getSubscriptionStore().list().some(e => e.enabled)
  if (hasSubs) {
    try {
      const snap = await getSubscriptionAggregator().fetchAggregatedYaml()
      const entries = extractProxiesFromYaml(snap.yaml)
      if (entries.length > 0) return entries
    } catch (err) {
      getLogger().warn({ err }, 'Aggregated server list failed — falling back to config source')
    }
  }
  return getConfigSourceService().getServerList()
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export function registerServersHandlers(): void {
  handleIpc(IpcChannel.SERVERS_LIST, EmptySchema, async () => {
    const log = getLogger()
    try {
      const entries = await resolveServerListEntries()
      const servers = entries.map(toServer)
      await enrichCountriesByIp(servers, entries)
      return okResult(servers)
    } catch (err: unknown) {
      log.warn({ err }, 'Failed to fetch server list')
      return okResult([])
    }
  })

  handleIpc(IpcChannel.SERVERS_PROBE, EmptySchema, async () => {
    const log = getLogger()
    try {
      const entries = await resolveServerListEntries()
      if (entries.length === 0) return okResult(undefined)

      const runtime = services.resolve<RuntimeService>('runtime')
      const engineRunning = runtime.getState() === 'running'

      if (engineRunning) {
        await probeViaEngine(entries, runtime)
      } else {
        await probeViaTcp(entries)
      }
    } catch (err: unknown) {
      log.warn({ err }, 'Server probe failed')
    }
    return okResult(undefined)
  })
}

async function probeViaEngine(entries: ServerListEntry[], runtime: RuntimeService): Promise<void> {
  // Run probes concurrently with limit
  const chunks = chunkArray(entries, PROBE_CONCURRENCY)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (entry) => {
        const latencyMs = await runtime.probeProxyLatency(entry.name, PROBE_TEST_URL, PROBE_TIMEOUT_MS)
          .catch(() => null)
        const result = {
          id: entry.name,
          latencyMs,
          success: latencyMs !== null && latencyMs > 0,
          timestamp: Date.now(),
        }
        const snapshot = healthTracker.record(result)
        const payload: ServerLatencyPayload = {
          proxyName: entry.name,
          latencyMs,
          success: result.success,
          score: snapshot.score,
        }
        sendToRenderer(IpcChannel.EVENT_SERVER_LATENCY, payload)
      })
    )
  }
}

async function probeViaTcp(entries: ServerListEntry[]): Promise<void> {
  const prober = new NodeProber(PROBE_TIMEOUT_MS)
  const targets = entries
    .filter(e => e.server && e.port)
    .map(e => ({ id: e.name, server: e.server, port: e.port! }))

  const chunks = chunkArray(targets, PROBE_CONCURRENCY)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (target) => {
        const result = await prober.probe(target)
        const snapshot = healthTracker.record(result)
        const payload: ServerLatencyPayload = {
          proxyName: target.id,
          latencyMs: result.latencyMs,
          success: result.success,
          score: snapshot.score,
        }
        sendToRenderer(IpcChannel.EVENT_SERVER_LATENCY, payload)
      })
    )
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
