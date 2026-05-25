import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Plus, Trash2, Zap, ListFilter, Server, AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { dnsApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import type {
  DnsProfileConfig,
  CustomDnsResolver,
  CustomDnsRule,
  DnsResolverKind,
  DnsRuleMatchKind,
} from '@shared/ipc/types'

// Make uuid without crypto.subtle (simple time+rand — sufficient for UI keys)
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const RESOLVER_KIND_LABELS: Record<DnsResolverKind, string> = {
  doh: 'DoH',
  dot: 'DoT',
  doq: 'DoQ',
  udp: 'UDP',
  tcp: 'TCP',
}

const MATCH_KIND_LABELS: Record<DnsRuleMatchKind, string> = {
  domain: 'Точно',
  domain_suffix: 'Суффикс',
  domain_keyword: 'Содержит',
  geosite: 'Geosite',
}

const RESOLVER_PLACEHOLDER: Record<DnsResolverKind, string> = {
  doh: 'https://dns.google/dns-query',
  dot: 'tls://1.1.1.1',
  doq: 'quic://dns.adguard.com',
  udp: '8.8.8.8',
  tcp: 'tcp://1.1.1.1',
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-bg-secondary/40 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-text-muted" />}
        <Icon className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-[12px] font-semibold text-text-primary">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge tone="accent" className="text-[9px]">{count}</Badge>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Custom resolvers section ────────────────────────────────────────────────

function ResolversSection({
  resolvers,
  onChange,
}: {
  resolvers: CustomDnsResolver[]
  onChange: (next: CustomDnsResolver[]) => void
}) {
  const [type, setType] = useState<DnsResolverKind>('doh')
  const [url, setUrl] = useState('')
  const [preferH3, setPreferH3] = useState(false)

  const add = (): void => {
    if (!url.trim()) return
    onChange([
      ...resolvers,
      { id: newId(), type, url: url.trim(), ...(type === 'doh' && preferH3 ? { preferH3: true } : {}) },
    ])
    setUrl('')
  }

  const remove = (id: string): void => onChange(resolvers.filter(r => r.id !== id))

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-text-muted">
        Эти resolvers замещают primary nameservers в выбранном пресете. DoQ работает только с sing-box.
      </p>

      {resolvers.length > 0 && (
        <div className="rounded-md border border-border bg-bg-secondary divide-y divide-border/40">
          {resolvers.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <Badge tone="accent" className="text-[9px] font-mono shrink-0">
                {RESOLVER_KIND_LABELS[r.type]}
              </Badge>
              <code className="text-[11px] text-text-secondary font-mono flex-1 truncate">
                {r.url}
                {r.preferH3 && <span className="text-text-muted ml-1">·H/3</span>}
              </code>
              <button
                onClick={() => remove(r.id)}
                className="text-text-muted hover:text-error transition-colors"
                title="Удалить"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-secondary p-3">
        <div className="flex items-center gap-2">
          <select
            value={type}
            onChange={e => setType(e.target.value as DnsResolverKind)}
            className="bg-bg-primary border border-border rounded px-2 py-1 text-[11px] text-text-secondary"
          >
            {(['doh', 'dot', 'doq', 'udp', 'tcp'] as DnsResolverKind[]).map(k => (
              <option key={k} value={k}>{RESOLVER_KIND_LABELS[k]}</option>
            ))}
          </select>
          <Input
            placeholder={RESOLVER_PLACEHOLDER[type]}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            className="flex-1"
          />
          {type === 'doh' && (
            <label className="flex items-center gap-1 text-[10px] text-text-muted">
              <input
                type="checkbox"
                checked={preferH3}
                onChange={e => setPreferH3(e.target.checked)}
              />
              H/3
            </label>
          )}
          <Button variant="primary" size="sm" onClick={add} disabled={!url.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Per-domain rules section ────────────────────────────────────────────────

function RulesSection({
  rules,
  onChange,
}: {
  rules: CustomDnsRule[]
  onChange: (next: CustomDnsRule[]) => void
}) {
  const [matchType, setMatchType] = useState<DnsRuleMatchKind>('domain_suffix')
  const [value, setValue] = useState('')
  const [resolverTag, setResolverTag] = useState('direct')

  const add = (): void => {
    if (!value.trim() || !resolverTag.trim()) return
    onChange([
      ...rules,
      { id: newId(), matchType, value: value.trim(), resolverTag: resolverTag.trim() },
    ])
    setValue('')
  }

  const remove = (id: string): void => onChange(rules.filter(r => r.id !== id))

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-text-muted">
        Например: <code className="font-mono">openai.com</code> → <code className="font-mono">primary</code>,
        <code className="font-mono"> sberbank.ru</code> → <code className="font-mono">direct</code>.
      </p>

      {rules.length > 0 && (
        <div className="rounded-md border border-border bg-bg-secondary divide-y divide-border/40">
          {rules.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <Badge tone="neutral" className="text-[9px] shrink-0">
                {MATCH_KIND_LABELS[r.matchType]}
              </Badge>
              <code className="text-[11px] text-text-secondary font-mono flex-1 truncate">{r.value}</code>
              <span className="text-[10px] text-text-muted">→</span>
              <code className="text-[11px] text-accent font-mono shrink-0 truncate max-w-[160px]">
                {r.resolverTag}
              </code>
              <button
                onClick={() => remove(r.id)}
                className="text-text-muted hover:text-error transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-secondary p-3">
        <div className="flex items-center gap-2">
          <select
            value={matchType}
            onChange={e => setMatchType(e.target.value as DnsRuleMatchKind)}
            className="bg-bg-primary border border-border rounded px-2 py-1 text-[11px] text-text-secondary"
          >
            {(['domain', 'domain_suffix', 'domain_keyword', 'geosite'] as DnsRuleMatchKind[]).map(k => (
              <option key={k} value={k}>{MATCH_KIND_LABELS[k]}</option>
            ))}
          </select>
          <Input
            placeholder={matchType === 'geosite' ? 'cn' : 'openai.com'}
            value={value}
            onChange={e => setValue(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wide shrink-0">резолвер:</span>
          <select
            value={['primary', 'fallback', 'direct', 'system'].includes(resolverTag) ? resolverTag : '__inline__'}
            onChange={e => {
              const v = e.target.value
              if (v === '__inline__') setResolverTag('https://1.1.1.1/dns-query')
              else setResolverTag(v)
            }}
            className="bg-bg-primary border border-border rounded px-2 py-1 text-[11px] text-text-secondary"
          >
            <option value="primary">primary</option>
            <option value="fallback">fallback</option>
            <option value="direct">direct (system)</option>
            <option value="__inline__">Свой URL...</option>
          </select>
          {!['primary', 'fallback', 'direct', 'system'].includes(resolverTag) && (
            <Input
              placeholder="https://... / tls://... / quic://..."
              value={resolverTag}
              onChange={e => setResolverTag(e.target.value)}
              className="flex-1"
            />
          )}
          <Button variant="primary" size="sm" onClick={add} disabled={!value.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Prefetch section ────────────────────────────────────────────────────────

function PrefetchSection({
  domains,
  onChange,
}: {
  domains: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const v = draft.trim()
    if (!v || domains.includes(v)) { setDraft(''); return }
    onChange([...domains, v])
    setDraft('')
  }

  const remove = (d: string): void => onChange(domains.filter(x => x !== d))

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-text-muted">
        Эти домены резолвятся в фоне на старте — сокращает first-hit latency для частых сервисов.
      </p>

      {domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map(d => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-md bg-bg-secondary border border-border px-2 py-0.5 text-[10px] font-mono"
            >
              {d}
              <button onClick={() => remove(d)} className="text-text-muted hover:text-error">
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="google.com"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          className="flex-1"
        />
        <Button variant="primary" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function DnsAdvancedSection() {
  const { notify } = useUIStore()
  const [profile, setProfile] = useState<DnsProfileConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dnsApi.getProfile().then(setProfile).catch(() => undefined)
  }, [])

  const persist = async (next: DnsProfileConfig): Promise<void> => {
    setProfile(next)
    setSaving(true)
    try {
      await dnsApi.setProfile({ profile: next })
    } catch (err) {
      notify({ type: 'error', title: 'Не сохранилось', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  const resolvers = profile.customResolvers ?? []
  const rules = profile.customRules ?? []
  const prefetch = profile.prefetchDomains ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.15 }}
      className="flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Расширенные настройки
        </p>
        {saving && <span className="text-[10px] text-text-muted">Сохранение...</span>}
      </div>

      <CollapsibleSection
        title="Свои DNS resolvers (DoH / DoT / DoQ / UDP / TCP)"
        icon={Server}
        count={resolvers.length}
      >
        <ResolversSection
          resolvers={resolvers}
          onChange={next => void persist({ ...profile, customResolvers: next })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Per-domain DNS правила"
        icon={ListFilter}
        count={rules.length}
      >
        <RulesSection
          rules={rules}
          onChange={next => void persist({ ...profile, customRules: next })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Pre-resolve домены (warming)"
        icon={Zap}
        count={prefetch.length}
      >
        <PrefetchSection
          domains={prefetch}
          onChange={next => void persist({ ...profile, prefetchDomains: next })}
        />
      </CollapsibleSection>

      <div className="flex items-start gap-1.5 px-1 text-[11px] text-text-muted">
        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Изменения применяются при следующем подключении или hot-reload (через "Применить" в меню профиля).
        </span>
      </div>
    </motion.div>
  )
}
