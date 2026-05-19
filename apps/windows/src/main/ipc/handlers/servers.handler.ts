import type { Server } from '@slave-vpn/shared'
import { NodeProber, NodeHealthTracker } from '@slave-vpn/runtime'
import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { okResult } from '../../../shared/ipc/types'
import type { ServerLatencyPayload } from '../../../shared/ipc/types'
import type { RuntimeService } from '../../services/RuntimeService'
import { handleIpc, services } from '../registry'
import { getConfigSourceService } from '../../services/impl/ConfigSourceService'
import type { ServerListEntry } from '../../services/impl/ConfigSourceService'
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

function detectCountry(name: string, server: string): CountryInfo {
  const haystack = `${name} ${server}`.toLowerCase()
  for (const [keyword, info] of COUNTRY_KEYWORDS) {
    if (haystack.includes(keyword)) return info
  }
  return { code: 'UN', name: 'Неизвестно', flag: '🌐' }
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

// ─── Handlers ─────────────────────────────────────────────────────────────────

export function registerServersHandlers(): void {
  handleIpc(IpcChannel.SERVERS_LIST, EmptySchema, async () => {
    const log = getLogger()
    try {
      const entries = await getConfigSourceService().getServerList()
      return okResult(entries.map(toServer))
    } catch (err: unknown) {
      log.warn({ err }, 'Failed to fetch server list')
      return okResult([])
    }
  })

  handleIpc(IpcChannel.SERVERS_PROBE, EmptySchema, async () => {
    const log = getLogger()
    try {
      const entries = await getConfigSourceService().getServerList()
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
