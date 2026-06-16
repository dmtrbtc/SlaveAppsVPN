// Persisted runtime settings for the Android client: the DoH DNS provider and
// the user-managed rule-provider lists (full add/remove/toggle management).
// localStorage-backed (durable on the Capacitor WebView), mirrors the existing
// `slave.settings.*.v1` key convention used elsewhere in the bridge.

import { getBypassRuleListDefaults } from '@slave-vpn/core'

const DNS_PROVIDER_LS_KEY = 'slave.settings.dnsProvider.v1'
const RULE_LISTS_LS_KEY = 'slave.settings.ruleLists.v1'

// ─── DNS (DoH) provider — LEGACY read-only migration source ──────────────────
// The DoH provider now lives in unified AppSettings.dohProvider (shared with
// Windows). This getter is kept ONLY so installs that persisted a choice in the
// old localStorage key keep it on first run after upgrading; compile-config reads
// `settings.dohProvider ?? getDnsProvider()`. The catalogue + resolveDohUrl moved
// to @slave-vpn/core (DOH_PROVIDERS). Shape matches core's DohProviderSetting.

interface LegacyDnsProviderSetting {
  id: string
  customUrl?: string
}

const DEFAULT_DNS: LegacyDnsProviderSetting = { id: 'cloudflare' }

export function getDnsProvider(): LegacyDnsProviderSetting {
  try {
    const raw = window.localStorage.getItem(DNS_PROVIDER_LS_KEY)
    if (raw) {
      const v = JSON.parse(raw) as LegacyDnsProviderSetting
      if (v && typeof v.id === 'string') return v
    }
  } catch { /* ignore */ }
  return DEFAULT_DNS
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

// Defaults are PROJECTED from the shared core catalogue (RULE_PROVIDER_PRESETS)
// so the bypass lists are not a second hardcoded source — P3 unification. The
// proxy-action domain/ip-cidr presets become the Android builtin lists; their
// `enabled` flags decide which ship on by default (inside-raw + Re-filter).
const DEFAULT_RULE_LISTS: RuleListEntry[] = getBypassRuleListDefaults().map((e) => ({
  ...e,
  builtin: true,
}))

// Built-in list URLs that broke upstream (404 / wrong format) → their working
// replacement. Applied on load so installs that persisted the old URL self-heal
// without losing the user's enabled/interval choices.
const DEAD_URL_FIXES: Record<string, string> = {
  'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/domains/all.lst':
    'https://raw.githubusercontent.com/1andrevich/Re-filter-lists/main/domains_all.lst',
}

function reviveLists(raw: string): RuleListEntry[] | null {
  try {
    const arr = JSON.parse(raw) as RuleListEntry[]
    if (!Array.isArray(arr)) return null
    return arr
      .filter(e => e && typeof e.url === 'string' && typeof e.name === 'string')
      .map(e => ({
        id: String(e.id ?? e.url),
        name: String(e.name),
        url: DEAD_URL_FIXES[String(e.url)] ?? String(e.url),
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
