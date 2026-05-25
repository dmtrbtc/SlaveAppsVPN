import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bot, CircleDot, Wifi } from 'lucide-react'
import { cn, countryFlagEmoji } from '../../lib/utils'
import {
  useVpnStore,
  selectProxyList,
  selectSelectedProxy,
  selectBalancerState,
  selectConnectionState,
  selectServerLatency,
} from '../../stores/vpn.store'

function LatencyBadge({ ms }: { ms: number | null | undefined }) {
  if (ms === undefined || ms === null) {
    return <CircleDot className="h-3 w-3 text-text-muted shrink-0" />
  }
  const color =
    ms < 100 ? 'text-connected' :
    ms < 300 ? 'text-yellow-400' :
    'text-error'
  return <span className={cn('text-[10px] font-mono shrink-0', color)}>{ms}ms</span>
}

export function ConnectionTargetSelector() {
  const proxyList = useVpnStore(selectProxyList)
  const selectedProxy = useVpnStore(selectSelectedProxy)
  const balancerState = useVpnStore(selectBalancerState)
  const state = useVpnStore(selectConnectionState)
  const serverLatency = useVpnStore(selectServerLatency)
  const fetchProxyList = useVpnStore(s => s.fetchProxyList)
  const setProxy = useVpnStore(s => s.setProxy)
  const setBalancerEnabled = useVpnStore(s => s.setBalancerEnabled)

  const isConnected = state === 'connected'
  const balancerEnabled = balancerState?.enabled ?? false
  const currentBest = balancerState?.currentBest

  useEffect(() => {
    void fetchProxyList()
  }, [fetchProxyList])

  const getNodeLatency = (name: string): number | null | undefined => {
    // Priority: balancer probe (most recent) → live latency events → static proxy meta.
    const score = balancerState?.nodes.find(n => n.name === name)
    if (score?.latencyMs !== undefined && score.latencyMs !== null) return score.latencyMs
    const live = serverLatency[name]
    if (live !== undefined) return live
    return proxyList.find(p => p.name === name)?.latencyMs
  }

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Сервер
        </span>
        <button
          onClick={() => void setBalancerEnabled(!balancerEnabled)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150',
            balancerEnabled
              ? 'bg-accent/15 text-accent border border-accent/20'
              : 'bg-bg-secondary text-text-muted hover:text-text-secondary border border-transparent'
          )}
        >
          <Bot className="h-3 w-3" />
          Авто
        </button>
      </div>

      {/* Proxy list */}
      <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
        {proxyList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-text-muted">
            <Wifi className="h-5 w-5 opacity-40" />
            <span className="text-[11px]">Серверы не загружены</span>
          </div>
        ) : (
          proxyList.map((proxy, i) => {
            const latency = getNodeLatency(proxy.name)
            const isSelected = !balancerEnabled && (selectedProxy === proxy.name || (!selectedProxy && i === 0))
            const isAutoSelected = balancerEnabled && currentBest === proxy.name
            const active = isSelected || isAutoSelected
            const flag = countryFlagEmoji(proxy.countryCode)

            return (
              <motion.button
                key={proxy.name}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                onClick={() => {
                  if (isConnected) void setProxy(proxy.name)
                }}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-left w-full transition-all duration-150 group',
                  active
                    ? 'bg-accent/10 border border-accent/25'
                    : isConnected
                      ? 'hover:bg-bg-secondary border border-transparent cursor-pointer'
                      : 'border border-transparent cursor-default opacity-70'
                )}
              >
                <span className="text-sm leading-none shrink-0">{flag || '🌐'}</span>
                <span className={cn(
                  'flex-1 text-[12px] font-medium truncate',
                  active ? 'text-accent' : 'text-text-primary'
                )}>
                  {proxy.name}
                </span>
                {isAutoSelected && (
                  <Bot className="h-3 w-3 text-accent shrink-0" />
                )}
                <LatencyBadge ms={latency} />
              </motion.button>
            )
          })
        )}
      </div>
    </div>
  )
}
