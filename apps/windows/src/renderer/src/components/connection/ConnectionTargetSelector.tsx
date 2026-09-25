import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Bot, Check, LoaderCircle, Wifi } from 'lucide-react'
import { cn, countryFlagEmoji } from '../../lib/utils'
import { IS_MOBILE } from '../../lib/platform'
import { vpnApi } from '../../lib/api'
import { resolveNodeLatency } from '../../lib/node-latency'
import {
  useVpnStore,
  selectProxyList,
  selectSelectedProxy,
  selectActiveProxy,
  selectAutoMode,
  selectBalancerState,
  selectConnectionState,
  selectServerLatency,
  selectServerHealth,
  AUTO_GROUP,
} from '../../stores/vpn.store'
import { useUIStore } from '../../stores/ui.store'

function LatencyBadge({ ms, unstable }: { ms: number | null | undefined; unstable?: boolean }) {
  if (unstable) {
    return (
      <span
        className="text-[10px] font-mono shrink-0 text-yellow-400"
        title="Узел нестабилен: повторные провалы замера"
      >
        ⚠ {ms !== null && ms !== undefined ? `${ms}ms` : '—'}
      </span>
    )
  }
  if (ms === undefined || ms === null) {
    return <span className="text-[10px] font-mono text-text-muted shrink-0">—</span>
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
  const activeProxy = useVpnStore(selectActiveProxy)
  const autoMode = useVpnStore(selectAutoMode)
  const balancerState = useVpnStore(selectBalancerState)
  const state = useVpnStore(selectConnectionState)
  const serverLatency = useVpnStore(selectServerLatency)
  const serverHealth = useVpnStore(selectServerHealth)

  const isUnstable = (name: string): boolean => {
    const h = serverHealth[name]
    return h !== undefined && (h.quarantined || h.consecutiveFailures >= 2)
  }
  const fetchProxyList = useVpnStore(s => s.fetchProxyList)
  const setProxy = useVpnStore(s => s.setProxy)
  const selectAuto = useVpnStore(s => s.selectAuto)
  const notify = useUIStore(s => s.notify)
  const [switchingTarget, setSwitchingTarget] = useState<string | null>(null)

  const isConnected = state === 'connected'
  const balancerEnabled = balancerState?.enabled ?? false
  const currentBest = balancerState?.currentBest

  // On Android the autobalancer is the SLAVE-AUTO url-test group selected via
  // setProxy(AUTO_GROUP); on desktop it's the balancer service. "auto" unifies both.
  const autoActive = IS_MOBILE ? autoMode : balancerEnabled

  useEffect(() => {
    void fetchProxyList()
  }, [fetchProxyList])

  // Dashboard ping (BOTH platforms): kick a latency probe once nodes are loaded
  // and again when connected, so the ms badges populate on the dashboard — not
  // only after opening the Servers tab. Both platforms use the engine's real
  // proxy URLTest; latency therefore appears only while connected. Safe: this
  // doesn't change the selected proxy or routing.
  const proxyCount = proxyList.length
  useEffect(() => {
    if (proxyCount === 0) return
    void vpnApi.probeAll().catch(() => undefined)
  }, [proxyCount, isConnected])

  const getNodeLatency = (name: string): number | null | undefined => {
    // A received failure (null) must not resurrect an older successful ping.
    const live = serverLatency[name]
    if (live !== undefined) return resolveNodeLatency(live)
    const score = balancerState?.nodes.find(n => n.name === name)
    return resolveNodeLatency(score?.latencyMs, proxyList.find(p => p.name === name)?.latencyMs)
  }

  // The real leaf carrying traffic while in Auto (SLAVE-SELECT → SLAVE-AUTO → node).
  const autoLeaf = IS_MOBILE ? activeProxy : (currentBest ?? null)
  const autoLeafLatency = autoLeaf ? getNodeLatency(autoLeaf) : undefined
  const autoLeafFlag = autoLeaf ? countryFlagEmoji(proxyList.find(p => p.name === autoLeaf)?.countryCode) : ''

  const chooseNode = async (name: string): Promise<void> => {
    if (switchingTarget) return
    setSwitchingTarget(name)
    try {
      await setProxy(name)
      notify({
        type: 'success',
        title: isConnected ? 'Сервер переключён' : 'Сервер выбран',
        message: name,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Не удалось выбрать сервер',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSwitchingTarget(null)
    }
  }

  const toggleAuto = async (): Promise<void> => {
    if (switchingTarget) return
    if (autoActive) {
      const target = autoLeaf ?? proxyList[0]?.name
      if (target) await chooseNode(target)
      return
    }
    setSwitchingTarget(AUTO_GROUP)
    try {
      await selectAuto()
      notify({ type: 'success', title: 'Автовыбор включён', message: 'Приложение выберет лучший доступный узел' })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Не удалось включить автовыбор',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSwitchingTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Сервер
        </span>
        <button
          onClick={() => void toggleAuto()}
          disabled={switchingTarget !== null}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150',
            autoActive
              ? 'bg-accent/15 text-accent border border-accent/20'
              : 'bg-bg-secondary text-text-muted hover:text-text-secondary border border-transparent'
          )}
          title={autoActive ? 'Авто-выбор быстрейшего узла (нажмите для ручного)' : 'Включить авто-выбор быстрейшего узла'}
        >
          {switchingTarget === AUTO_GROUP
            ? <LoaderCircle className="h-3 w-3 animate-spin" />
            : <Bot className="h-3 w-3" />}
          {autoActive ? 'Автовыбор включён' : 'Включить автовыбор'}
        </button>
      </div>

      {/* Auto leaf readout — «Авто → Slave-NL (12ms)» */}
      {autoActive && (
        <div className="flex items-center gap-1.5 shrink-0 rounded-md bg-accent/5 border border-accent/15 px-2 py-1">
          <Bot className="h-3 w-3 text-accent shrink-0" />
          <span className="text-[10px] text-text-muted">Авто →</span>
          {autoLeaf ? (
            <>
              <span className="text-sm leading-none">{autoLeafFlag || '🌐'}</span>
              <span className="text-[11px] font-medium text-accent truncate">{autoLeaf}</span>
              <span className="ml-auto"><LatencyBadge ms={autoLeafLatency} unstable={autoLeaf ? isUnstable(autoLeaf) : false} /></span>
            </>
          ) : (
            <span className="text-[11px] text-text-muted italic">{isConnected ? 'определяется…' : 'подключитесь'}</span>
          )}
        </div>
      )}

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
            const isSelected = !autoActive && (selectedProxy === proxy.name || (!selectedProxy && i === 0))
            // While auto, highlight the leaf actually in use.
            const isAutoSelected = autoActive && (autoLeaf === proxy.name || currentBest === proxy.name)
            const isActuallyActive = isConnected && activeProxy === proxy.name
            const active = isSelected || isAutoSelected || isActuallyActive
            const flag = countryFlagEmoji(proxy.countryCode)

            return (
              <motion.button
                key={proxy.name}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                onClick={() => void chooseNode(proxy.name)}
                disabled={switchingTarget !== null}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-left w-full transition-all duration-150 group',
                  active
                    ? 'bg-accent/10 border border-accent/25'
                    : 'hover:bg-bg-secondary border border-transparent cursor-pointer'
                )}
              >
                <span className="text-sm leading-none shrink-0">{flag || '🌐'}</span>
                <span className={cn(
                  // No `truncate`: server names are short (e.g. "Slave-EE") and
                  // were being ellipsised to "Slave-..." in the narrow mobile
                  // panel. Allow wrapping instead of clipping.
                  'flex-1 text-[12px] font-medium break-words',
                  active ? 'text-accent' : 'text-text-primary'
                )}>
                  {proxy.name}
                </span>
                {isAutoSelected && (
                  <Bot className="h-3 w-3 text-accent shrink-0" />
                )}
                {isSelected && !autoActive && (
                  <span className="flex items-center gap-0.5 text-[9px] text-accent shrink-0">
                    <Check className="h-2.5 w-2.5" /> выбран
                  </span>
                )}
                {isActuallyActive && (
                  <span className="flex items-center gap-0.5 text-[9px] text-connected shrink-0">
                    <Activity className="h-2.5 w-2.5" /> активен
                  </span>
                )}
                {switchingTarget === proxy.name && <LoaderCircle className="h-3 w-3 animate-spin text-accent shrink-0" />}
                <LatencyBadge ms={latency} unstable={isUnstable(proxy.name)} />
              </motion.button>
            )
          })
        )}
      </div>
    </div>
  )
}
