import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, ArrowDown, Clock, Cpu, AlertTriangle, RefreshCw } from 'lucide-react'
import { AuroraOrb } from '../components/connection/AuroraOrb'
import { ConnectionPhaseTracker } from '../components/connection/ConnectionPhaseTracker'
import { ConnectionQualityBadge } from '../components/connection/ConnectionQualityBadge'
import { ConnectionTargetSelector } from '../components/connection/ConnectionTargetSelector'
import { TrafficRouteIndicator } from '../components/connection/TrafficRouteIndicator'
import { ReconnectDisplay } from '../components/connection/ReconnectDisplay'
import { TrafficSparkline } from '../components/traffic/TrafficSparkline'
import { ActiveConnectionsPanel } from '../components/connections/ActiveConnectionsPanel'
import { ProfileSwitcher } from '../components/profile/ProfileSwitcher'
import { UpdateBanner } from '../components/update/UpdateBanner'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { StatTile } from '../components/ui/stat-tile'
import {
  useVpnStore,
  selectVpnStatus,
  selectVpnTraffic,
  selectEngineVersion,
  selectConnectionState,
  selectReconnectAttempts,
  selectConnectionStartedAt,
} from '../stores/vpn.store'
import { formatSpeed, formatBytes, formatUptime } from '../lib/utils'

const MODE_LABELS: Record<string, string> = {
  full:    'Полный VPN',
  bypass:  'Обход блокировок',
  split:   'Раздельный',
  custom:  'Кастомный',
}

const PROTOCOL_LABELS: Record<string, string> = {
  vless:       'VLESS',
  reality:     'REALITY',
  hysteria2:   'Hysteria2',
  tuic:        'TUIC',
  trojan:      'Trojan',
  shadowsocks: 'SS',
  unknown:     '—',
}

// Isolated 1s clock
function UptimeClock({ connectedAt }: { connectedAt: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!connectedAt) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [connectedAt])
  return <>{connectedAt ? formatUptime(connectedAt) : '—'}</>
}

// ─── Top status bar ──────────────────────────────────────────────────────────

function StatusBar() {
  const state = useVpnStore(selectConnectionState)
  const status = useVpnStore(selectVpnStatus)

  const dotColor =
    state === 'connected'   ? 'bg-connected' :
    state === 'connecting' || state === 'reconnecting' ? 'bg-connecting animate-pulse' :
    state === 'error'       ? 'bg-error' :
    'bg-border-strong'

  const stateLabel =
    state === 'connected'    ? 'Защищено' :
    state === 'connecting'   ? 'Подключение...' :
    state === 'reconnecting' ? 'Переподключение...' :
    state === 'disconnecting'? 'Отключение...' :
    state === 'error'        ? 'Ошибка' :
    'Не защищено'

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-[13px] font-medium text-text-primary">{stateLabel}</span>
      <div className="flex items-center gap-1.5 ml-1">
        <Badge variant={state === 'connected' ? 'ok' : 'neutral'}>
          {MODE_LABELS[status.mode] ?? status.mode}
        </Badge>
        {status.protocol && (
          <Badge variant="protocol">
            {PROTOCOL_LABELS[status.protocol] ?? status.protocol}
          </Badge>
        )}
      </div>
      <div className="ml-auto">
        <ProfileSwitcher />
      </div>
    </div>
  )
}

// ─── Server hero card ────────────────────────────────────────────────────────

function ServerHeroCard() {
  const state = useVpnStore(selectConnectionState)

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {state === 'connected' && (
        <ConnectionQualityBadge />
      )}
      {/* «Куда идёт трафик» — current mode + behaviour, taps to Маршрутизация. */}
      <TrafficRouteIndicator />
      <div className="flex-1 min-h-0">
        <ConnectionTargetSelector />
      </div>
    </div>
  )
}

// ─── Error card ───────────────────────────────────────────────────────────────

function ErrorCard() {
  const status = useVpnStore(selectVpnStatus)
  const connect = useVpnStore(s => s.connect)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-error/25 bg-error/5 p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-error shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-error mb-0.5">Ошибка подключения</p>
          {status.lastError && (
            <p className="text-[11px] text-text-muted leading-relaxed break-words">
              {status.lastError}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="w-full border-error/30 text-error hover:bg-error/10"
        onClick={() => void connect()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Повторить попытку
      </Button>
    </motion.div>
  )
}

// ─── Live traffic stats row ───────────────────────────────────────────────────

function StatsRow() {
  const traffic = useVpnStore(selectVpnTraffic)
  const status = useVpnStore(selectVpnStatus)
  const engineVersion = useVpnStore(selectEngineVersion)
  const startedAt = useVpnStore(selectConnectionStartedAt)
  const state = useVpnStore(selectConnectionState)
  const isConnected = state === 'connected'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile
        label="Загрузка"
        value={isConnected ? formatSpeed(traffic.downloadSpeedBps) : '—'}
        {...(isConnected ? { sub: formatBytes(traffic.sessionDownloadBytes) } : {})}
        icon={<ArrowDown className="h-3 w-3 text-connected" />}
        mono
      />
      <StatTile
        label="Отдача"
        value={isConnected ? formatSpeed(traffic.uploadSpeedBps) : '—'}
        {...(isConnected ? { sub: formatBytes(traffic.sessionUploadBytes) } : {})}
        icon={<ArrowUp className="h-3 w-3 text-accent" />}
        mono
      />
      <StatTile
        label="Сессия"
        value={<UptimeClock connectedAt={status.connectedAt ?? startedAt} />}
        icon={<Clock className="h-3 w-3 text-text-secondary" />}
        mono
      />
      <StatTile
        label="Движок"
        value={engineVersion ? `Mihomo ${engineVersion}` : 'Mihomo'}
        icon={<Cpu className="h-3 w-3 text-text-secondary" />}
      />
    </div>
  )
}

// ─── Right column content (varies by state) ───────────────────────────────────

function RightColumn() {
  const state = useVpnStore(selectConnectionState)
  const attempts = useVpnStore(selectReconnectAttempts)
  const startedAt = useVpnStore(selectConnectionStartedAt)

  return (
    <div className="flex flex-col justify-center gap-4 h-full">
      <AnimatePresence mode="wait">
        {(state === 'connecting' || state === 'reconnecting') && (
          <motion.div
            key="phase"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            {state === 'reconnecting' && attempts > 0 && (
              <ReconnectDisplay attempts={attempts} startedAt={startedAt} />
            )}
            <ConnectionPhaseTracker connectionState={state} />
          </motion.div>
        )}
        {(state === 'connected' || state === 'disconnected' || state === 'disconnecting') && (
          <motion.div
            key="server"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25 }}
          >
            <ServerHeroCard />
          </motion.div>
        )}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25 }}
          >
            <ErrorCard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)

  const handleToggle = () => {
    if (state === 'connected') void disconnect()
    else if (state === 'disconnected' || state === 'error') void connect()
  }

  return (
    <div className="flex h-full flex-col bg-bg-base">

      {/* Android in-app update banner (notify + download button) */}
      <UpdateBanner />

      {/* Top status bar */}
      <StatusBar />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 flex flex-col gap-5">

        {/* Hero row — orb + right column (stacks on narrow/mobile) */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:min-h-[260px]">

          {/* Left: Orb */}
          <div className="flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <AuroraOrb
                state={state}
                onToggle={handleToggle}
                size={200}
              />
            </motion.div>
          </div>

          {/* Right: Server card / Phase tracker */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="rounded-lg border border-border bg-bg-primary p-5"
          >
            <RightColumn />
          </motion.div>
        </div>

        {/* Live stats row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <StatsRow />
        </motion.div>

        {/* Live traffic sparkline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <TrafficSparkline />
        </motion.div>

        {/* Active connections */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <ActiveConnectionsPanel />
        </motion.div>

      </div>
    </div>
  )
}
