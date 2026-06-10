import type { RuleProvider } from '../settings/types.js'

/**
 * Built-in rule-provider presets — ported verbatim from the Windows
 * RuleProviderService so both platforms ship the same catalogue. Presets cannot
 * be deleted (isPreset); the bypass lists are auto-refreshable.
 *
 * All URLs are PLAIN-domain lists (one domain per line) so they parse under a
 * mihomo `domain`-behavior text rule-provider (which matches the domain and its
 * subdomains). The previous runetfreedom `*.txt` sources were geosite-format
 * (`domain:…` / `full:…`) which a text provider can't parse, and `domains/all.lst`
 * 404s — replaced with itdoginfo (per-service) and Re-filter (comprehensive).
 */
export const RULE_PROVIDER_PRESETS: RuleProvider[] = [
  {
    id: 'builtin-russia-bypass',
    name: 'Russia Bypass',
    enabled: true,
    kind: 'builtin',
    url: '',
    type: 'domain-list',
    action: 'direct',
    priority: 100,
    category: 'russia-bypass',
    isPreset: true,
    ruleCount: 2000,
  },
  {
    id: 'builtin-private',
    name: 'Private Networks',
    enabled: true,
    kind: 'builtin',
    url: '',
    type: 'ip-cidr-list',
    action: 'direct',
    priority: 50,
    category: 'system',
    isPreset: true,
    ruleCount: 8,
  },
  {
    id: 'preset-runetfreedom-youtube',
    name: 'YouTube (itdoginfo)',
    enabled: false,
    kind: 'github',
    url: 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/youtube.lst',
    type: 'domain-list',
    action: 'proxy',
    priority: 510,
    category: 'streaming',
    isPreset: true,
  },
  {
    id: 'preset-runetfreedom-discord',
    name: 'Discord (itdoginfo)',
    enabled: false,
    kind: 'github',
    url: 'https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/discord.lst',
    type: 'domain-list',
    action: 'proxy',
    priority: 511,
    category: 'work',
    isPreset: true,
  },
  {
    id: 'preset-runetfreedom-ru-blocked',
    name: 'Заблокированные в РФ (Re-filter)',
    enabled: true,
    kind: 'github',
    url: 'https://raw.githubusercontent.com/1andrevich/Re-filter-lists/main/domains_all.lst',
    type: 'domain-list',
    action: 'proxy',
    priority: 520,
    category: 'russia-bypass',
    isPreset: true,
  },
  {
    id: 'preset-runetfreedom-antifilter',
    name: 'RuNet Freedom · Antifilter',
    enabled: false,
    kind: 'github',
    url: 'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/antifilter-download.txt',
    type: 'domain-list',
    action: 'proxy',
    priority: 530,
    category: 'russia-bypass',
    isPreset: true,
  },
  {
    id: 'preset-runetfreedom-refilter',
    name: 'RuNet Freedom · Refilter',
    enabled: false,
    kind: 'github',
    url: 'https://raw.githubusercontent.com/runetfreedom/russia-blocked-geosite/release/refilter.txt',
    type: 'domain-list',
    action: 'proxy',
    priority: 531,
    category: 'russia-bypass',
    isPreset: true,
  },
]
