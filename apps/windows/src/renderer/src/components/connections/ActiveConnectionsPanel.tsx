import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, X, ArrowUp, ArrowDown, Globe, Cpu } from 'lucide-react'
import { formatBytes } from '@slave-vpn/shared'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { vpnApi } from '../../lib/api'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import { useUIStore } from '../../stores/ui.store'
import type { ActiveConnection, ActiveConnectionsSnapshot } from '@shared/ipc/types'

const POLL_INTERVAL_MS = 2000
const TOP_N = 30

type SortKey = 'host' | 'upload' | 'download' | 'duration'

function durationMs(start: string): number {
  const d = Date.parse(start)
  return Number.isNaN(d) ? 0 : Math.max(0, Date.now() - d)
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function chainLabel(chain: string): string {
  if (!chain) return 'DIRECT'
  return chain.length > 24 ? chain.slice(0, 21) + '…' : chain
}

function isDirectChain(chain: string): boolean {
  return chain === 'DIRECT' || chain === ''
}

// Plain-language reason WHY a connection took its route, derived from the matched
// rule. Turns cryptic engine rules («GEOIP,RU,DIRECT», «RULE-SET,inside-raw,…»)
// into something a user understands. Falls back to the raw (truncated) rule.
function humanizeRule(rule: string, isDirect: boolean): string {
  const r = (rule || '').toUpperCase()
  if (!r) return 'по умолчанию'
  if (r.includes('PRIVATE') || r.startsWith('IP-CIDR') && isDirect) return 'локальная сеть'
  if (r.includes('GEOIP,RU') || r.includes('CATEGORY-RU') || r.includes('GEOSITE,RU')) return 'РФ-ресурс'
  if (r.startsWith('RULE-SET')) return 'заблокировано в РФ'
  if (r.includes('TELEGRAM')) return 'Telegram'
  if (r.includes('WHATSAPP') || r.includes('FACEBOOK')) return 'WhatsApp/Meta'
  if (r.includes('SIGNAL')) return 'Signal'
  if (r.includes('DISCORD')) return 'Discord'
  if (r.includes('GEOSITE')) {
    const m = /GEOSITE,([^,]+)/.exec(r)
    return m ? m[1]!.toLowerCase() : 'сайт'
  }
  if (r.startsWith('MATCH')) return 'по умолчанию'
  return rule.length > 28 ? rule.slice(0, 25) + '…' : rule
}

function ConnectionRow({ conn, onClose }: { conn: ActiveConnection; onClose?: (() => void) | undefined }) {
  const dur = durationMs(conn.start)
  const isDirect = isDirectChain(conn.chain)

  return (
    <div className="flex items-center gap-2 border-b border-border last:border-b-0 px-3 py-2 hover:bg-bg-secondary/40 transition-colors">
      <Globe className={cn('h-3 w-3 shrink-0', isDirect ? 'text-text-muted' : 'text-accent')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-medium text-text-primary truncate">
            {conn.host}{conn.destinationPort ? `:${conn.destinationPort}` : ''}
          </span>
          <Badge tone={isDirect ? 'neutral' : 'accent'} className="text-[9px] shrink-0">
            {isDirect ? 'напрямую' : 'через VPN'}
          </Badge>
          {conn.network && conn.network !== 'tcp' && (
            <Badge tone="neutral" className="text-[9px] shrink-0">{conn.network.toUpperCase()}</Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-muted flex-wrap font-mono">
          {conn.process && (
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-2.5 w-2.5" />
              {conn.process}
            </span>
          )}
          <span>{formatDuration(dur)}</span>
          {/* Why this route — plain-language reason from the matched rule, with the
              exit node on hover (raw rule + chain) for power users. */}
          <span
            className="truncate max-w-[200px]"
            title={`${conn.rule || 'нет правила'}${isDirect ? '' : ` · ${chainLabel(conn.chain)}`}`}
          >
            {humanizeRule(conn.rule, isDirect)}{!isDirect && conn.chain && conn.chain !== 'DIRECT' ? ` · ${chainLabel(conn.chain)}` : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end text-[10px] font-mono text-text-secondary shrink-0">
        <span className="flex items-center gap-1">
          <ArrowDown className="h-2.5 w-2.5 text-connected" />
          {formatBytes(conn.download)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp className="h-2.5 w-2.5 text-accent" />
          {formatBytes(conn.upload)}
        </span>
      </div>

      {/* Close this connection — supported on both platforms (desktop mihomo API +
          the clashbox.aar CloseConnection export). onClose stays optional so the row
          can also render read-only if a caller omits it. */}
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded text-text-muted hover:text-error hover:bg-error/5 transition-colors"
          title="Закрыть соединение"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function ActiveConnectionsPanel({ className }: { className?: string }) {
  const state = useVpnStore(selectConnectionState)
  const { notify } = useUIStore()
  const [snapshot, setSnapshot] = useState<ActiveConnectionsSnapshot | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('download')
  const [filter, setFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState<'all' | 'vpn' | 'direct'>('all')

  const isConnected = state === 'connected'

  useEffect(() => {
    if (!isConnected) {
      setSnapshot(null)
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async (): Promise<void> => {
      try {
        const s = await vpnApi.getConnections()
        if (alive) setSnapshot(s)
      } catch {
        // non-fatal
      } finally {
        if (alive) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [isConnected])

  const handleClose = async (id: string): Promise<void> => {
    try {
      await vpnApi.closeConnection(id)
      // Optimistically remove
      setSnapshot(prev => prev
        ? { ...prev, connections: prev.connections.filter(c => c.id !== id), count: Math.max(0, prev.count - 1) }
        : prev)
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const sortedFiltered = useMemo(() => {
    if (!snapshot) return []
    const norm = filter.trim().toLowerCase()
    const byText = norm
      ? snapshot.connections.filter(c =>
          c.host.toLowerCase().includes(norm) ||
          (c.process?.toLowerCase().includes(norm) ?? false) ||
          c.chain.toLowerCase().includes(norm))
      : snapshot.connections

    // Route filter: «через VPN» / «напрямую» / все.
    const filtered = routeFilter === 'all'
      ? byText
      : byText.filter(c => routeFilter === 'direct' ? isDirectChain(c.chain) : !isDirectChain(c.chain))

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'upload':   return b.upload - a.upload
        case 'download': return b.download - a.download
        case 'duration': return durationMs(a.start) > durationMs(b.start) ? -1 : 1
        case 'host':     return a.host.localeCompare(b.host)
      }
    })

    return sorted.slice(0, TOP_N)
  }, [snapshot, filter, sortKey, routeFilter])

  // «Куда идёт трафик» — how many live connections go through the VPN vs direct.
  const routeSummary = useMemo(() => {
    if (!snapshot) return null
    let vpn = 0
    let direct = 0
    for (const c of snapshot.connections) {
      if (isDirectChain(c.chain)) direct++
      else vpn++
    }
    return { vpn, direct }
  }, [snapshot])

  return (
    <div className={cn('rounded-lg border border-border bg-bg-primary overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-[12px] font-semibold text-text-primary">Активные соединения</span>
          {snapshot && (
            <Badge tone="neutral" className="text-[10px]">{snapshot.count}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Фильтр..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            disabled={!isConnected}
            className="bg-bg-secondary border border-border rounded px-2 py-0.5 text-[11px] text-text-secondary w-32 placeholder:text-text-muted focus:outline-none focus:border-accent/40 disabled:opacity-50"
          />
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            disabled={!isConnected}
            className="bg-bg-secondary border border-border rounded px-2 py-0.5 text-[11px] text-text-secondary focus:outline-none focus:border-accent/40 disabled:opacity-50"
          >
            <option value="download">↓ Загрузка</option>
            <option value="upload">↑ Отдача</option>
            <option value="duration">Время</option>
            <option value="host">Хост</option>
          </select>
        </div>
      </div>

      {/* «Куда идёт трафик» — tap a chip to filter by route. */}
      {isConnected && routeSummary && (routeSummary.vpn > 0 || routeSummary.direct > 0) && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border">
          {([
            ['all',    'Все',        routeSummary.vpn + routeSummary.direct],
            ['vpn',    'Через VPN',  routeSummary.vpn],
            ['direct', 'Напрямую',   routeSummary.direct],
          ] as const).map(([key, label, n]) => {
            const active = routeFilter === key
            return (
              <button
                key={key}
                onClick={() => setRouteFilter(key)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors',
                  active
                    ? key === 'vpn'
                      ? 'border-accent/40 bg-accent/15 text-accent'
                      : 'border-border-strong bg-bg-secondary text-text-primary'
                    : 'border-border text-text-muted hover:text-text-secondary hover:bg-bg-secondary',
                )}
              >
                {label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="max-h-[380px] overflow-y-auto">
        {!isConnected ? (
          <div className="px-4 py-8 text-center text-[12px] text-text-muted">
            VPN не подключен
          </div>
        ) : !snapshot ? (
          <div className="px-4 py-8 text-center text-[12px] text-text-muted">
            Загрузка...
          </div>
        ) : sortedFiltered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-text-muted">
            {filter || routeFilter !== 'all' ? 'Ничего не найдено' : 'Нет активных соединений'}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sortedFiltered.map(conn => (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <ConnectionRow conn={conn} onClose={() => void handleClose(conn.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {snapshot && snapshot.count > TOP_N && (
        <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted text-center">
          Показано {TOP_N} из {snapshot.count}
        </div>
      )}
    </div>
  )
}

// Compact close-all button — convenience for the dashboard
export function CloseAllConnectionsButton() {
  const { notify } = useUIStore()
  const [busy, setBusy] = useState(false)
  const state = useVpnStore(selectConnectionState)

  const handleClick = async (): Promise<void> => {
    setBusy(true)
    try {
      // We don't have a dedicated bulk endpoint exposed yet — close one by one
      const snapshot = await vpnApi.getConnections()
      if (!snapshot) return
      await Promise.all(snapshot.connections.map(c => vpnApi.closeConnection(c.id).catch(() => undefined)))
      notify({ type: 'success', title: 'Соединения сброшены', message: `${snapshot.count} закрыто` })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => void handleClick()}
      disabled={busy || state !== 'connected'}
    >
      Сбросить все
    </Button>
  )
}
