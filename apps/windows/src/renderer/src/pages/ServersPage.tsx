import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, Wifi, WifiOff, AlertCircle, RefreshCw, Check } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Spinner } from '../components/ui/spinner'
import { countryFlagEmoji } from '../lib/utils'
import { cn } from '../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ipc } from '../lib/ipc'
import { useVpnStore } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import type { Server } from '@slave-vpn/shared'

type SortKey = 'name' | 'latency' | 'country'

const AVAILABILITY_CONFIG = {
  online: { Icon: Wifi, color: 'text-connected', label: 'Онлайн' },
  degraded: { Icon: AlertCircle, color: 'text-connecting', label: 'Деградация' },
  offline: { Icon: WifiOff, color: 'text-error', label: 'Оффлайн' },
  unknown: { Icon: WifiOff, color: 'text-text-muted', label: 'Неизвестно' },
}

function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async (): Promise<Server[]> => {
      // TODO: wire to ipc.servers.list() when implemented
      await new Promise(r => setTimeout(r, 400))
      return MOCK_SERVERS
    },
    staleTime: 60_000,
  })
}

export function ServersPage() {
  const { status } = useVpnStore()
  const { notify } = useUIStore()
  const { data: servers = [], isLoading, refetch, isFetching } = useServers()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('latency')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [connecting, setConnecting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = servers.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.countryName.toLowerCase().includes(search.toLowerCase())
    )
    list = list.sort((a, b) => {
      const aFav = favorites.has(a.id) ? -1 : 0
      const bFav = favorites.has(b.id) ? -1 : 0
      if (aFav !== bFav) return aFav - bFav
      if (sortKey === 'latency') {
        const al = a.latencyMs ?? 9999
        const bl = b.latencyMs ?? 9999
        return al - bl
      }
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      return a.countryName.localeCompare(b.countryName)
    })
    return list
  }, [servers, search, sortKey, favorites])

  const handleToggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelect = async (server: Server) => {
    if (connecting || server.availability === 'offline') return
    setConnecting(server.id)
    try {
      await ipc.vpn.connect()
      notify({ type: 'success', title: 'Сервер выбран', message: `Подключение к ${server.name}` })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка подключения', message: String(err) })
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-semibold text-text-primary">Серверы</h1>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
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
                sortKey === key
                  ? 'bg-accent/15 text-text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {key === 'latency' ? 'Пинг' : key === 'name' ? 'Имя' : 'Страна'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-sm">
            Серверы не найдены
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((server, i) => {
              const avail = AVAILABILITY_CONFIG[server.availability]
              const isSelected = status.serverName === server.name
              const isFav = favorites.has(server.id)
              const isConnecting = connecting === server.id
              const flag = countryFlagEmoji(server.countryCode)

              return (
                <motion.div
                  key={server.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
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
                        {isSelected && (
                          <Check className="h-3 w-3 text-accent shrink-0" />
                        )}
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
                      <avail.Icon className={cn('h-3.5 w-3.5', avail.color)} />
                      {isConnecting ? (
                        <Spinner size="sm" />
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleFavorite(server.id) }}
                          className="opacity-40 hover:opacity-100 transition-opacity"
                        >
                          <Star className={cn('h-3.5 w-3.5', isFav && 'fill-connecting text-connecting opacity-100')} />
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

const MOCK_SERVERS: Server[] = [
  { id: '1', name: 'Moscow-01', countryCode: 'RU', countryName: 'Россия', flagEmoji: '🇷🇺', availability: 'online', latencyMs: 12, isFavorite: false, isSelected: false },
  { id: '2', name: 'Amsterdam-01', countryCode: 'NL', countryName: 'Нидерланды', flagEmoji: '🇳🇱', availability: 'online', latencyMs: 45, isFavorite: false, isSelected: false },
  { id: '3', name: 'Frankfurt-01', countryCode: 'DE', countryName: 'Германия', flagEmoji: '🇩🇪', availability: 'online', latencyMs: 52, isFavorite: false, isSelected: false },
  { id: '4', name: 'Helsinki-01', countryCode: 'FI', countryName: 'Финляндия', flagEmoji: '🇫🇮', availability: 'online', latencyMs: 38, isFavorite: false, isSelected: false },
  { id: '5', name: 'Warsaw-01', countryCode: 'PL', countryName: 'Польша', flagEmoji: '🇵🇱', availability: 'degraded', latencyMs: 61, isFavorite: false, isSelected: false },
  { id: '6', name: 'Paris-01', countryCode: 'FR', countryName: 'Франция', flagEmoji: '🇫🇷', availability: 'online', latencyMs: 78, isFavorite: false, isSelected: false },
  { id: '7', name: 'London-01', countryCode: 'GB', countryName: 'Великобритания', flagEmoji: '🇬🇧', availability: 'online', latencyMs: 95, isFavorite: false, isSelected: false },
  { id: '8', name: 'Vilnius-01', countryCode: 'LT', countryName: 'Литва', flagEmoji: '🇱🇹', availability: 'online', latencyMs: 29, isFavorite: false, isSelected: false },
  { id: '9', name: 'New-York-01', countryCode: 'US', countryName: 'США', flagEmoji: '🇺🇸', availability: 'online', latencyMs: 142, isFavorite: false, isSelected: false },
  { id: '10', name: 'Singapore-01', countryCode: 'SG', countryName: 'Сингапур', flagEmoji: '🇸🇬', availability: 'offline', latencyMs: null, isFavorite: false, isSelected: false },
]
