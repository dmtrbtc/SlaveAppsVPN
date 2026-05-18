import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, RefreshCw, Check } from 'lucide-react'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Segmented } from '../components/ui/segmented'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/states'
import { cn, countryFlagEmoji } from '../lib/utils'
import { useServers } from '../hooks/useServers'
import { useVpnStore, selectVpnStatus } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { Server, ServerAvailability } from '@slave-vpn/shared'

type SortKey = 'latency' | 'name' | 'country'

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

// ─── Protocol badge ───────────────────────────────────────────────────────────

function protocolLabel(server: Server): string | null {
  if (server.securityType === 'reality') return 'REALITY'
  if (server.transport === 'grpc') return 'gRPC'
  if (server.transport === 'ws') return 'WS'
  if (server.securityType === 'tls') return 'TLS'
  if (server.proxyType && server.proxyType !== 'vless') return server.proxyType.toUpperCase()
  return null
}

function protocolTone(label: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (label === 'REALITY') return 'warn'
  if (label === 'gRPC' || label === 'WS') return 'ok'
  if (label === 'TLS') return 'neutral'
  return 'neutral'
}

// ─── Server row ──────────────────────────────────────────────────────────────

interface ServerRowProps {
  server: Server
  isSelected: boolean
  isFav: boolean
  isConnecting: boolean
  onSelect: () => void
  onFav: (e: React.MouseEvent) => void
}

function ServerRow({ server, isSelected, isFav, isConnecting, onSelect, onFav }: ServerRowProps) {
  const flag = countryFlagEmoji(server.countryCode)
  const avail = AVAILABILITY_BADGE[server.availability]
  const isOffline = server.availability === 'offline'
  const proto = protocolLabel(server)

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

      {/* Name + country + protocol badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-primary truncate">{server.name}</span>
          {isSelected && <Check className="h-3 w-3 text-accent shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-text-muted">{server.countryName}</span>
          {proto && (
            <Badge tone={protocolTone(proto)} className="text-[9px] py-0 px-1 h-[14px] leading-none">
              {proto}
            </Badge>
          )}
        </div>
      </div>

      {/* Latency */}
      <div className="w-[60px] text-right">
        {server.latencyMs !== null ? (
          <span className={cn(
            'text-[12px] font-mono',
            server.latencyMs < 80  ? 'text-connected' :
            server.latencyMs < 200 ? 'text-connecting' :
            'text-error'
          )}>
            {server.latencyMs}ms
          </span>
        ) : (
          <span className="text-[12px] text-text-muted font-mono">—</span>
        )}
      </div>

      {/* Status badge */}
      <div className="w-[90px] flex justify-center">
        <Badge tone={avail.variant}>{avail.label}</Badge>
      </div>

      {/* Fav / spinner */}
      <div className="w-8 flex justify-center">
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

// ─── Main page ────────────────────────────────────────────────────────────────

export function ServersPage() {
  const status = useVpnStore(selectVpnStatus)
  const { notify, serverFavorites, toggleServerFavorite } = useUIStore()
  const { data: servers = [], isLoading, error, refetch, isFetching } = useServers()

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('latency')
  const [connectingId, setConnectingId] = useState<string | null>(null)

  const connect = useVpnStore(s => s.connect)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = servers.filter(s =>
      s.name.toLowerCase().includes(q) || s.countryName.toLowerCase().includes(q)
    )
    return list.sort((a, b) => {
      const af = serverFavorites.includes(a.id) ? 0 : 1
      const bf = serverFavorites.includes(b.id) ? 0 : 1
      if (af !== bf) return af - bf
      if (sortKey === 'latency') return (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999)
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      return a.countryName.localeCompare(b.countryName)
    })
  }, [servers, search, sortKey, serverFavorites])

  const handleSelect = async (server: Server) => {
    if (connectingId || server.availability === 'offline') return
    setConnectingId(server.id)
    try {
      await connect()
      notify({ type: 'success', title: 'Подключение', message: `→ ${server.name}` })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка подключения', message: err instanceof Error ? err.message : String(err) })
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
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {isLoading ? (
          <LoadingState label="Загрузка серверов..." />
        ) : error ? (
          <ErrorState error={error} retry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8" />}
            label="Серверы не найдены"
            description={search ? 'Попробуйте изменить запрос' : 'Нет доступных серверов'}
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
                  isSelected={status.serverName === server.name}
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
