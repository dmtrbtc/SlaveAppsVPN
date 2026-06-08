// Persisted runtime settings for the Android client: the DoH DNS provider and
// the user-managed rule-provider lists (full add/remove/toggle management).
// localStorage-backed (durable on the Capacitor WebView), mirrors the existing
// `slave.settings.*.v1` key convention used elsewhere in the bridge.

const DNS_PROVIDER_LS_KEY = 'slave.settings.dnsProvider.v1'
const RULE_LISTS_LS_KEY = 'slave.settings.ruleLists.v1'

// ─── DNS (DoH) provider ──────────────────────────────────────────────────────

export interface DohProvider {
  id: string
  label: string
  /** DoH endpoint. Empty for the "custom" entry until the user fills `customUrl`. */
  doh: string
}

export const DOH_PRESETS: DohProvider[] = [
  { id: 'cloudflare', label: 'Cloudflare', doh: 'https://dns.cloudflare.com/dns-query' },
  { id: 'google',     label: 'Google',     doh: 'https://dns.google/dns-query' },
  { id: 'quad9',      label: 'Quad9',      doh: 'https://dns.quad9.net/dns-query' },
  { id: 'adguard',    label: 'AdGuard',    doh: 'https://dns.adguard-dns.com/dns-query' },
]

export interface DnsProviderSetting {
  /** preset id, or 'custom' */
  id: string
  /** used when id === 'custom' */
  customUrl?: string
}

const DEFAULT_DNS: DnsProviderSetting = { id: 'cloudflare' }

export function getDnsProvider(): DnsProviderSetting {
  try {
    const raw = window.localStorage.getItem(DNS_PROVIDER_LS_KEY)
    if (raw) {
      const v = JSON.parse(raw) as DnsProviderSetting
      if (v && typeof v.id === 'string') return v
    }
  } catch { /* ignore */ }
  return DEFAULT_DNS
}

export function setDnsProvider(v: DnsProviderSetting): void {
  try { window.localStorage.setItem(DNS_PROVIDER_LS_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

/** Resolve the effective DoH URL for the current setting (falls back to Cloudflare). */
export function resolveDohUrl(v: DnsProviderSetting = getDnsProvider()): string {
  if (v.id === 'custom') {
    const u = (v.customUrl ?? '').trim()
    if (/^https:\/\//i.test(u)) return u
    return DOH_PRESETS[0]!.doh
  }
  return DOH_PRESETS.find(p => p.id === v.id)?.doh ?? DOH_PRESETS[0]!.doh
}

// ─── Rule-provider lists (full management) ───────────────────────────────────

export interface RuleListEntry {
  id: string
  name: string
  url: string
  behavior: 'domain' | 'ipcidr'
  enabled: boolean
  /** auto-refresh interval (hours) mihomo uses for this provider */
  intervalHours: number
  /** built-in presets cannot be deleted (only toggled / interval-edited) */
  builtin?: boolean
}

// Default = the RKN-blocked domains list shipped before, now a manageable entry,
// plus a popular optional preset (disabled by default).
const DEFAULT_RULE_LISTS: RuleListEntry[] = [
  {
    id: 'inside-raw',
    name: 'Базовый список доменов',
    url: 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/inside-raw.lst',
    behavior: 'domain',
    enabled: true,
    intervalHours: 24,
    builtin: true,
  },
  {
    id: 'runet-freedom',
    name: 'RuNet Freedom (расширенный)',
    url: 'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/domains/all.lst',
    behavior: 'domain',
    enabled: false,
    intervalHours: 24,
    builtin: true,
  },
]

function reviveLists(raw: string): RuleListEntry[] | null {
  try {
    const arr = JSON.parse(raw) as RuleListEntry[]
    if (!Array.isArray(arr)) return null
    return arr
      .filter(e => e && typeof e.url === 'string' && typeof e.name === 'string')
      .map(e => ({
        id: String(e.id ?? e.url),
        name: String(e.name),
        url: String(e.url),
        behavior: e.behavior === 'ipcidr' ? 'ipcidr' : 'domain',
        enabled: e.enabled !== false,
        intervalHours: typeof e.intervalHours === 'number' && e.intervalHours > 0 ? e.intervalHours : 24,
        ...(e.builtin ? { builtin: true } : {}),
      }))
  } catch {
    return null
  }
}

export function getRuleLists(): RuleListEntry[] {
  try {
    const raw = window.localStorage.getItem(RULE_LISTS_LS_KEY)
    if (raw) {
      const v = reviveLists(raw)
      if (v && v.length > 0) return v
    }
  } catch { /* ignore */ }
  return DEFAULT_RULE_LISTS.map(e => ({ ...e }))
}

export function setRuleLists(lists: RuleListEntry[]): void {
  try { window.localStorage.setItem(RULE_LISTS_LS_KEY, JSON.stringify(lists)) } catch { /* ignore */ }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || `list-${Date.now()}`
}

/** Add a user list. Returns the updated list. Throws on invalid/duplicate URL. */
export function addRuleList(input: { name: string; url: string; behavior?: 'domain' | 'ipcidr'; intervalHours?: number }): RuleListEntry[] {
  const url = input.url.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('URL должен начинаться с http(s)://')
  const lists = getRuleLists()
  if (lists.some(l => l.url === url)) throw new Error('Такой список уже добавлен')
  const name = input.name.trim() || url.split('/').pop() || 'Список'
  const entry: RuleListEntry = {
    id: `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    url,
    behavior: input.behavior === 'ipcidr' ? 'ipcidr' : 'domain',
    enabled: true,
    intervalHours: input.intervalHours && input.intervalHours > 0 ? input.intervalHours : 24,
  }
  const next = [...lists, entry]
  setRuleLists(next)
  return next
}

export function removeRuleList(id: string): RuleListEntry[] {
  // builtin entries can be disabled but not deleted
  const next = getRuleLists().filter(l => l.id !== id || l.builtin)
  setRuleLists(next)
  return next
}

export function updateRuleList(id: string, patch: Partial<Pick<RuleListEntry, 'enabled' | 'intervalHours' | 'name' | 'url' | 'behavior'>>): RuleListEntry[] {
  const next = getRuleLists().map(l => (l.id === id ? { ...l, ...patch } : l))
  setRuleLists(next)
  return next
}
