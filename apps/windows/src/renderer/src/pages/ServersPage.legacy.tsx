import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, Wifi, WifiOff, AlertCircle, RefreshCw, Check } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/states'
import { countryFlagEmoji, cn } from '../lib/utils'
import { useServers } from '../hooks/useServers'
import { useVpnStore, selectVpnStatus } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { Server, ServerAvailability } from '@slave-vpn/shared'

type SortKey = 'latency' | 'name' | 'country'

const AVAILABILITY_ICON: Record<ServerAvailability, React.ComponentType<{ className?: string }>> = {
  online: Wifi,
  degraded: AlertCircle,
  offline: WifiOff,
  unknown: WifiOff,
}

const AVAILABILITY_COLOR: Record<ServerAvailability, string> = {
  online: 'text-connected',
  degraded: 'text-connecting',
  offline: 'text-error',
  unknown: 'text-text-muted',
}

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
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-semibold text-text-primary">Серверы</h1>
          <Button variant="ghost" size="icon-sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
        <Input
          placeholder="Поиск по имени или стране..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          icon={<Search className="h-3.5 w-3.5" />}
        />
        <div className="flex gap-1.5 mt-3">
          {(['latency', 'name', 'country'] as SortKey[]).map(key => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                sortKey === key ? 'bg-accent/15 text-text-accent' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {key === 'latency' ? 'Пинг' : key === 'name' ? 'Имя' : 'Страна'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
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
          <div className="flex flex-col gap-2">
            {filtered.map((server, i) => {
              const AvailIcon = AVAILABILITY_ICON[server.availability]
              const isSelected = status.serverName === server.name
              const isFav = serverFavorites.includes(server.id)
              const isConnecting = connectingId === server.id
              const flag = countryFlagEmoji(server.countryCode)

              return (
                <motion.div
                  key={server.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.2 }}
                >
                  <Card
                    className={cn(
                      'flex items-center gap-3 cursor-pointer transition-colors hover:bg-bg-elevated active:scale-[0.99]',
                      isSelected && 'ring-1 ring-accent/40 bg-accent/5',
                      server.availability === 'offline' && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => void handleSelect(server)}
                  >
                    <span className="text-xl leading-none">{flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-text-primary truncate">{server.name}</p>
                        {isSelected && <Check className="h-3 w-3 text-accent shrink-0" />}
                      </div>
                      <p className="text-[11px] text-text-muted">{server.countryName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {server.latencyMs !== null && (
                        <span className={cn(
                          'text-[11px] font-mono',
                          server.latencyMs < 80 ? 'text-connected' :
                          server.latencyMs < 200 ? 'text-connecting' : 'text-error'
                        )}>
                          {server.latencyMs}ms
                        </span>
                      )}
                      <AvailIcon className={cn('h-3.5 w-3.5', AVAILABILITY_COLOR[server.availability])} />
                      {isConnecting ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); toggleServerFavorite(server.id) }}
                          className={cn(
                            'transition-opacity',
                            isFav ? 'opacity-100' : 'opacity-30 hover:opacity-100'
                          )}
                        >
                          <Star className={cn('h-3.5 w-3.5', isFav && 'fill-connecting text-connecting')} />
                        </button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
