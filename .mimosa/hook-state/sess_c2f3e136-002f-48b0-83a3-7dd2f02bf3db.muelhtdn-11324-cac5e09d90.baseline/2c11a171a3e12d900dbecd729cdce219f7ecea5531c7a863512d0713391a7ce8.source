import { getLogger } from '../logger'
import { getSettingsStore } from './SettingsStore'
import { buildDnsProfileConfig } from './DnsProfileService'
import type { DnsLeakReport, DnsLeakResolver } from '../../shared/ipc/types'

const TRACE_URL = 'https://1.1.1.1/cdn-cgi/trace'
// DoH whoami — reveals the actual resolver IP that served the query
const WHOAMI_URL = 'https://1.1.1.1/dns-query?name=whoami.cloudflare&type=TXT'
const TIMEOUT_MS = 5_000

interface TraceFields {
  ip?: string
  loc?: string
  colo?: string
  // Cloudflare also exposes warp/gateway/etc., but we don't need them
}

function parseTrace(raw: string): TraceFields {
  const out: TraceFields = {}
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key === 'ip') out.ip = value
    else if (key === 'loc') out.loc = value
    else if (key === 'colo') out.colo = value
  }
  return out
}

interface WhoamiAnswer {
  data?: string  // includes hostname in quotes — e.g. "1.1.1.1"
  name?: string
  type?: number
}

async function fetchWhoami(url: string): Promise<DnsLeakResolver | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null

    const data = await res.json() as { Answer?: WhoamiAnswer[] }
    const first = data.Answer?.[0]
    if (!first?.data) return null

    // data is like "\"2a06:98c0:3600::103\"" or "\"1.1.1.1\""
    const cleaned = first.data.replace(/^"|"$/g, '').trim()
    return {
      ip: cleaned,
      asn: null,
      isp: null,
      country: null,
    }
  } catch (err) {
    getLogger().debug({ err }, 'DNS leak whoami probe failed')
    return null
  }
}

async function fetchTrace(): Promise<TraceFields | null> {
  try {
    const res = await fetch(TRACE_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const text = await res.text()
    return parseTrace(text)
  } catch (err) {
    getLogger().debug({ err }, 'DNS leak trace probe failed')
    return null
  }
}

// Extracts hostnames from configured DoH/DoT resolvers in settings.
// We treat resolver as "expected" when its host matches one of these.
function getExpectedResolverHosts(): string[] {
  const settings = getSettingsStore()
  const preset = settings.get('dnsPreset') ?? 'secure'
  const custom = settings.get('customDnsProfile') ?? null
  const profile = buildDnsProfileConfig(preset, custom)

  const candidates = [profile.primaryDoh, ...profile.fallbackDns]
  const hosts = new Set<string>()
  for (const c of candidates) {
    if (!c) continue
    try {
      // URL parser handles https://, tls://, tcp:// uniformly
      const parsed = new URL(c.includes('://') ? c : `udp://${c}`)
      if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase())
    } catch {
      // Plain IP — add as-is
      hosts.add(c.toLowerCase())
    }
  }
  return [...hosts]
}

// Compares observed resolver IP against expected hosts. Conservative heuristic:
// if the observed IP doesn't look like any configured resolver, flag as leak.
// Cloudflare 1.1.1.1 + 1.0.0.1 + Google 8.8.8.8 + 8.8.4.4 — well-known IPs we cross-check.
const KNOWN_RESOLVER_FAMILIES: Record<string, string> = {
  '1.1.1.1':       'cloudflare',
  '1.0.0.1':       'cloudflare',
  '2606:4700:4700::1111': 'cloudflare',
  '2606:4700:4700::1001': 'cloudflare',
  '8.8.8.8':       'google',
  '8.8.4.4':       'google',
  '2001:4860:4860::8888': 'google',
  '2001:4860:4860::8844': 'google',
  '9.9.9.9':       'quad9',
  '149.112.112.112': 'quad9',
}

function inferLeak(observed: DnsLeakResolver | null, expectedHosts: string[]): { leaked: boolean; warning: string | null } {
  if (!observed?.ip) {
    return { leaked: false, warning: 'Не удалось определить резолвер (попробуйте ещё раз)' }
  }
  const ip = observed.ip.toLowerCase()
  const family = KNOWN_RESOLVER_FAMILIES[ip]
  if (!family) {
    return { leaked: true, warning: `Запрос обслужил неизвестный резолвер ${ip} — возможна утечка` }
  }

  // Map expected hostnames to families
  const expectedFamilies = new Set<string>()
  for (const host of expectedHosts) {
    if (host.includes('cloudflare') || host === '1.1.1.1' || host === '1.0.0.1') {
      expectedFamilies.add('cloudflare')
    } else if (host.includes('google') || host === '8.8.8.8' || host === '8.8.4.4' || host.includes('dns.google')) {
      expectedFamilies.add('google')
    } else if (host.includes('quad9') || host === '9.9.9.9') {
      expectedFamilies.add('quad9')
    }
  }

  if (expectedFamilies.size === 0) {
    // Can't classify expected — give benign info
    return { leaked: false, warning: null }
  }

  if (!expectedFamilies.has(family)) {
    return {
      leaked: true,
      warning: `Резолвер: ${family}, ожидался ${[...expectedFamilies].join('/')} — возможна утечка`,
    }
  }
  return { leaked: false, warning: null }
}

export async function runDnsLeakTest(): Promise<DnsLeakReport> {
  const start = Date.now()
  const [trace, whoami] = await Promise.all([fetchTrace(), fetchWhoami(WHOAMI_URL)])
  const expectedHosts = getExpectedResolverHosts()
  const resolvers: DnsLeakResolver[] = whoami ? [whoami] : []
  const { leaked, warning } = inferLeak(whoami, expectedHosts)

  return {
    publicIp: trace?.ip ?? null,
    publicCountry: trace?.loc ?? null,
    publicColo: trace?.colo ?? null,
    resolvers,
    expectedResolverHosts: expectedHosts,
    leaked,
    warning,
    testedAt: Date.now(),
    durationMs: Date.now() - start,
  }
}
