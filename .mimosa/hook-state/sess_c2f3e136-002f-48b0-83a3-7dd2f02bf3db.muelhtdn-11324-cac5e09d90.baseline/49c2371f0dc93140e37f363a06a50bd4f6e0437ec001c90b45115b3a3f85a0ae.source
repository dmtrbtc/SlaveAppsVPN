import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, RefreshCw, Check, Zap } from 'lucide-react'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Segmented } from '../components/ui/segmented'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/states'
import { cn, countryFlagEmoji } from '../lib/utils'
import { useServers } from '../hooks/useServers'
import { useVpnStore, selectVpnStatus, selectSelectedProxy } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { Server, ServerAvailability } from '@slave-vpn/shared'
import type { ServerLatencyPayload } from '../../../shared/ipc/types'

type SortKey = 'latency' | 'name' | 'country'
type ProtocolFilter = 'all' | 'reality' | 'vless' | 'vmess' | 'trojan' | 'ss' | 'hysteria2' | 'tuic'

const AVAILABILITY_BADGE: Record<ServerAvailability, { variant: 'ok' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  online:   { variant: 'ok',      label: 'Онлайн'   },
  degraded: { variant: 'warn',    label: 'Нестабильный' },
  offline:  { variant: 'bad',     label: 'Офлайн'   },
  unknown:  { variant: 'neutral', label: 'Неизвестно' },
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'latency', label: 'Пинг'   },
  { value: 'name',    label: 'Имя'    },
  { value: 'country', label: 'Страна' },
]

const PROTOCOL_FILTERS: { value: ProtocolFilter; label: string }[] = [
  { value: 'all',      label: 'Все'      },
  { value: 'reality',  label: 'Reality'  },
  { value: 'vless',    label: 'VLESS'    },
  { value: 'vmess',    label: 'VMess'    },
  { value: 'trojan',   label: 'Trojan'   },
  { value: 'ss',       label: 'SS'       },
  { value: 'hysteria2',label: 'HY2'      },
  { value: 'tuic',     label: 'TUIC'     },
]

// ─── Protocol badge ───────────────────────────────────────────────────────────

function protocolBadges(server: Server): Array<{ label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> {
  const badges: Array<{ label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = []

  if (server.securityType === 'reality') {
    badges.push({ label: 'REALITY', tone: 'warn' })
  } else if (server.securityType === 'tls') {
    badges.push({ label: 'TLS', tone: 'neutral' })
  }

  if (server.transport === 'grpc') badges.push({ label: 'gRPC', tone: 'ok' })
  else if (server.transport === 'ws') badges.push({ label: 'WS', tone: 'ok' })
  else if (server.transport === 'h2') badges.push({ label: 'H2', tone: 'neutral' })

  if (server.proxyType && !['vless', 'trojan'].includes(server.proxyType)) {
    badges.push({ label: server.proxyType.toUpperCase(), tone: 'neutral' })
  }

  return badges
}

function matchesProtocolFilter(server: Server, filter: ProtocolFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'reality') return server.securityType === 'reality'
  return server.proxyType === filter
}

// ─── Latency display ──────────────────────────────────────────────────────────

function LatencyDisplay({ ms, probing }: { ms: number | null; probing?: boolean }) {
  if (probing) {
    return <div className="h-2 w-8 rounded bg-border animate-pulse ml-auto" />
  }
  if (ms === null) {
    return <span className="text-[12px] text-text-muted font-mono">—</span>
  }
  return (
    <span className={cn(
      'text-[12px] font-mono',
      ms < 80  ? 'text-connected' :
      ms < 200 ? 'text-connecting' :
      'text-error'
    )}>
      {ms}ms
    </span>
  )
}

// ─── Server row ──────────────────────────────────────────────────────────────

interface ServerRowProps {
  server: Server
  liveLatency: number | null
  isProbing: boolean
  isSelected: boolean
  isFav: boolean
  isConnecting: boolean
  onSelect: () => void
  onFav: (e: React.MouseEvent) => void
}

function ServerRow({ server, liveLatency, isProbing, isSelected, isFav, isConnecting, onSelect, onFav }: ServerRowProps) {
  const flag = countryFlagEmoji(server.countryCode)
  const avail = AVAILABILITY_BADGE[server.availability]
  const isOffline = server.availability === 'offline'
  const badges = protocolBadges(server)
  const displayLatency = liveLatency ?? server.latencyMs

  return (
    <div
      onClick={isOffline ? undefined : onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-150',
        isSelected
          ? 'border-accent/40 bg-accent/5'
          : 'border-border bg-bg-primary hover:bg-bg-secondary hover:border-border-strong',
        isOffline ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.995]'
      )}
    >
      {/* Flag */}
      <span className="text-xl leading-none shrink-0">{flag}</span>

      {/* Name + country + protocol badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-primary truncate">{server.name}</span>
          {isSelected && <Check className="h-3 w-3 text-accent shrink-0" />}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className="text-[11px] text-text-muted">{server.countryName}</span>
          {badges.map(b => (
            <Badge key={b.label} tone={b.tone} className="text-[9px] py-0 px-1 h-[14px] leading-none">
              {b.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Latency + status — stacked on mobile (narrow column, leaves room for the
          name), inline on desktop. */}
      <div className="flex shrink-0 flex-col items-end gap-1 sm:w-[150px] sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <LatencyDisplay ms={displayLatency} probing={isProbing} />
        <div className="flex sm:w-[90px] sm:justify-center">
          <Badge tone={avail.variant}>{avail.label}</Badge>
        </div>
      </div>

      {/* Fav / spinner */}
      <div className="w-7 flex justify-center shrink-0">
        {isConnecting ? (
          <div className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        ) : (
          <button
            onClick={onFav}
            className={cn(
              'transition-opacity focus-visible:outline-none',
              isFav ? 'opacity-100' : 'opacity-25 hover:opacity-70'
            )}
            aria-label="Favourite"
          >
            <Star className={cn('h-3.5 w-3.5', isFav && 'fill-connecting text-connecting')} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Probe hook ───────────────────────────────────────────────────────────────

function useServerProbing(serverCount: number) {
  const [latencyMap, setLatencyMap] = useState<Map<string, number | null>>(new Map())
  const [probing, setProbing] = useState(false)
  const [probingSet, setProbingSet] = useState<Set<string>>(new Set())
  const unsubRef = useRef<(() => void) | null>(null)

  const startProbe = useCallback(async () => {
    if (serverCount === 0) return
    setProbing(true)

    try {
      await window.slaveVPN.servers.probe()
    } catch {
      // probe failure is non-fatal
    } finally {
      setProbing(false)
      setProbingSet(new Set())
    }
  }, [serverCount])

  useEffect(() => {
    // Subscribe to live latency events
    const unsub = window.slaveVPN.events.onServerLatency((payload: ServerLatencyPayload) => {
      setLatencyMap(prev => {
        const next = new Map(prev)
        next.set(payload.proxyName, payload.success ? payload.latencyMs : null)
        return next
      })
      setProbingSet(prev => {
        const next = new Set(prev)
        next.delete(payload.proxyName)
        return next
      })
    })
    unsubRef.current = unsub
    return () => { unsubRef.current?.(); unsubRef.current = null }
  }, [])

  // Auto-probe on mount (once servers are loaded)
  const hasProbed = useRef(false)
  useEffect(() => {
    if (serverCount > 0 && !hasProbed.current) {
      hasProbed.current = true
      void startProbe()
    }
  }, [serverCount, startProbe])

  return { latencyMap, probing, probingSet, startProbe }
}

// ─── Best node suggestion ─────────────────────────────────────────────────────

function useBestNode(servers: Server[], latencyMap: Map<string, number | null>): string | null {
  return useMemo(() => {
    let best: { name: string; ms: number } | null = null
    for (const s of servers) {
      const ms = latencyMap.get(s.name)
      if (ms !== null && ms !== undefined && ms > 0) {
        if (best === null || ms < best.ms) best = { name: s.name, ms }
      }
    }
    return best?.name ?? null
  }, [servers, latencyMap])
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ServersPage() {
  const status = useVpnStore(selectVpnStatus)
  const { notify, serverFavorites, toggleServerFavorite } = useUIStore()
  const { data: servers = [], isLoading, error, refetch, isFetching } = useServers()

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('latency')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [connectingId, setConnectingId] = useState<string | null>(null)

  const connect = useVpnStore(s => s.connect)
  const setProxy = useVpnStore(s => s.setProxy)
  const selectedProxy = useVpnStore(selectSelectedProxy)

  const { latencyMap, probing, startProbe } = useServerProbing(servers.length)
  const bestNode = useBestNode(servers, latencyMap)

  const handleRefresh = useCallback(async () => {
    await refetch()
    void startProbe()
  }, [refetch, startProbe])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = servers.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(q) || s.countryName.toLowerCase().includes(q)
      const matchesFilter = matchesProtocolFilter(s, protocolFilter)
      return matchesSearch && matchesFilter
    })
    return list.sort((a, b) => {
      const af = serverFavorites.includes(a.id) ? 0 : 1
      const bf = serverFavorites.includes(b.id) ? 0 : 1
      if (af !== bf) return af - bf
      if (sortKey === 'latency') {
        const aMs = latencyMap.get(a.name) ?? a.latencyMs ?? 9999
        const bMs = latencyMap.get(b.name) ?? b.latencyMs ?? 9999
        return aMs - bMs
      }
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      return a.countryName.localeCompare(b.countryName)
    })
  }, [servers, search, sortKey, protocolFilter, serverFavorites, latencyMap])

  const handleSelect = async (server: Server) => {
    if (connectingId || server.availability === 'offline') return
    setConnectingId(server.id)
    try {
      // THE fix: actually select the tapped server. Previously this only called
      // connect() — a no-op when already connected — so the choice never reached
      // the store/bridge/core and traffic stayed on the default (EE).
      // server.id === proxy name (servers map id from the proxy name).
      await setProxy(server.id)
      if (status.state !== 'connected') {
        // Not connected yet → connect; the persisted selection is applied on start.
        await connect()
        notify({ type: 'success', title: 'Подключение', message: `→ ${server.name}` })
      } else {
        // Already connected → setProxy live-switched the active server.
        notify({ type: 'success', title: 'Сервер', message: `→ ${server.name}` })
      }
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setConnectingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg-base">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-bg-base shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Серверы</h2>
            {!isLoading && (
              <span className="text-[12px] text-text-muted">{filtered.length}</span>
            )}
            {bestNode && sortKey === 'latency' && (
              <span className="flex items-center gap-1 text-[11px] text-connected">
                <Zap className="h-3 w-3" />
                Лучший: {bestNode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {probing && (
              <span className="text-[11px] text-text-muted animate-pulse">Проверка пинга...</span>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => void handleRefresh()} disabled={isFetching || probing}>
              <RefreshCw className={cn('h-3.5 w-3.5', (isFetching || probing) && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1">
            <Input
              placeholder="Поиск по имени или стране..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <Segmented
            options={SORT_OPTIONS}
            value={sortKey}
            onChange={setSortKey}
            size="sm"
          />
        </div>

        {/* Protocol filter */}
        <div className="flex gap-1 flex-wrap">
          {PROTOCOL_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setProtocolFilter(f.value)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border transition-colors',
                protocolFilter === f.value
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {isLoading ? (
          <LoadingState label="Загрузка серверов..." />
        ) : error ? (
          <ErrorState error={error} retry={() => void handleRefresh()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            label="Серверы не найдены"
            description={search ? 'Попробуйте изменить запрос' : protocolFilter !== 'all' ? 'Нет серверов с данным протоколом' : 'Нет доступных серверов'}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((server, i) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02, duration: 0.18 }}
              >
                <ServerRow
                  server={server}
                  liveLatency={latencyMap.get(server.name) ?? null}
                  isProbing={probing && !latencyMap.has(server.name)}
                  isSelected={selectedProxy === server.id || status.serverName === server.name}
                  isFav={serverFavorites.includes(server.id)}
                  isConnecting={connectingId === server.id}
                  onSelect={() => void handleSelect(server)}
                  onFav={e => { e.stopPropagation(); toggleServerFavorite(server.id) }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
