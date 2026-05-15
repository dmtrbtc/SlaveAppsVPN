import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, ArrowDown, Clock, Cpu, AlertTriangle, RefreshCw } from 'lucide-react'
import { ConnectionOrb } from '../components/connection/ConnectionOrb'
import { ConnectionPhaseTracker } from '../components/connection/ConnectionPhaseTracker'
import { ConnectionQualityBadge } from '../components/connection/ConnectionQualityBadge'
import { ReconnectDisplay } from '../components/connection/ReconnectDisplay'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import {
  useVpnStore,
  selectVpnStatus,
  selectVpnTraffic,
  selectEngineVersion,
  selectConnectionState,
  selectReconnectAttempts,
  selectConnectionStartedAt,
} from '../stores/vpn.store'
import { formatSpeed, formatBytes, formatUptime, countryFlagEmoji } from '../lib/utils'

const MODE_LABELS: Record<string, string> = {
  full: 'Полный VPN',
  bypass: 'Обход блокировок',
  split: 'Раздельный',
  custom: 'Кастомный',
}

const PROTOCOL_LABELS: Record<string, string> = {
  vless: 'VLESS',
  reality: 'REALITY',
  hysteria2: 'Hysteria2',
  tuic: 'TUIC',
  trojan: 'Trojan',
  shadowsocks: 'SS',
  unknown: '—',
}

// Isolated 1s clock — does not trigger parent rerenders
function UptimeClock({ connectedAt }: { connectedAt: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!connectedAt) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [connectedAt])
  return <>{connectedAt ? formatUptime(connectedAt) : '00:00:00'}</>
}

// ─── State panels ─────────────────────────────────────────────────────────────

function ConnectedPanel() {
  const traffic = useVpnStore(selectVpnTraffic)
  const status = useVpnStore(selectVpnStatus)
  const engineVersion = useVpnStore(selectEngineVersion)

  return (
    <motion.div
      key="connected"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
      className="flex flex-col items-center gap-3 w-full max-w-sm"
    >
      {/* Stat grid */}
      <div className="grid w-full grid-cols-2 gap-2.5">
        <StatCard
          label="Загрузка"
          value={formatSpeed(traffic.downloadSpeedBps)}
          sub={formatBytes(traffic.sessionDownloadBytes)}
          icon={<ArrowDown className="h-3.5 w-3.5 text-connected" />}
        />
        <StatCard
          label="Отдача"
          value={formatSpeed(traffic.uploadSpeedBps)}
          sub={formatBytes(traffic.sessionUploadBytes)}
          icon={<ArrowUp className="h-3.5 w-3.5 text-accent" />}
        />
        <StatCard
          label="Время сессии"
          value={<UptimeClock connectedAt={status.connectedAt} />}
          icon={<Clock className="h-3.5 w-3.5 text-text-secondary" />}
          mono
          fallback="00:00:00"
        />
        <StatCard
          label="Движок"
          value={engineVersion ? `Mihomo ${engineVersion}` : 'Mihomo'}
          icon={<Cpu className="h-3.5 w-3.5 text-text-secondary" />}
        />
      </div>

      {/* Quality badge */}
      <ConnectionQualityBadge className="self-stretch justify-center" />
    </motion.div>
  )
}

function ConnectingPanel({ state }: { state: 'connecting' | 'reconnecting' }) {
  const attempts = useVpnStore(selectReconnectAttempts)
  const startedAt = useVpnStore(selectConnectionStartedAt)

  return (
    <motion.div
      key="connecting"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
      className="flex flex-col items-center gap-3 w-full max-w-sm"
    >
      {state === 'reconnecting' && attempts > 0 && (
        <ReconnectDisplay attempts={attempts} startedAt={startedAt} />
      )}
      <ConnectionPhaseTracker connectionState={state} />
    </motion.div>
  )
}

function ErrorPanel() {
  const status = useVpnStore(selectVpnStatus)
  const connect = useVpnStore(s => s.connect)

  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
      className="w-full max-w-sm"
    >
      <div className="rounded-2xl border border-error/25 bg-error/5 px-4 py-3.5 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-error shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-error mb-0.5">Ошибка подключения</p>
            {status.lastError && (
              <p className="text-[11px] text-text-muted leading-relaxed break-words">
                {status.lastError}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-error/30 text-error hover:bg-error/10"
          onClick={() => void connect()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Повторить попытку
        </Button>
      </div>
    </motion.div>
  )
}

function DisconnectedHint() {
  return (
    <motion.div
      key="disconnected"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="text-center"
    >
      <p className="text-[11px] text-text-muted">
        Нажмите на орб чтобы начать защищённое соединение
      </p>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const status = useVpnStore(selectVpnStatus)
  const state = useVpnStore(selectConnectionState)
  const flag = countryFlagEmoji(status.countryCode)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-6 px-6 py-8">

        {/* Orb */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <ConnectionOrb />
        </motion.div>

        {/* Server + mode badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="flex flex-col items-center gap-2"
        >
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-base">{flag}</span>
            <span className="font-medium">{status.serverName ?? 'Сервер не выбран'}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <Badge variant={state === 'connected' ? 'connected' : 'default'} dot={state === 'connected'}>
              {MODE_LABELS[status.mode] ?? status.mode}
            </Badge>
            {status.protocol && (
              <Badge variant="protocol">{PROTOCOL_LABELS[status.protocol] ?? status.protocol}</Badge>
            )}
          </div>
        </motion.div>

        {/* FSM-driven state panel — animated transitions between all states */}
        <AnimatePresence mode="wait">
          {(state === 'connecting') && (
            <ConnectingPanel key="phase-connecting" state="connecting" />
          )}
          {(state === 'reconnecting') && (
            <ConnectingPanel key="phase-reconnecting" state="reconnecting" />
          )}
          {state === 'connected' && (
            <ConnectedPanel key="connected" />
          )}
          {state === 'error' && (
            <ErrorPanel key="error" />
          )}
          {(state === 'disconnected' || state === 'disconnecting') && (
            <DisconnectedHint key="disconnected" />
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: React.ReactNode
  sub?: string
  icon: React.ReactNode
  mono?: boolean
  fallback?: string
}

function StatCard({ label, value, sub, icon, mono, fallback }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className={`text-base font-semibold text-text-primary ${mono ? 'font-mono' : ''}`}>
        {value ?? fallback ?? '—'}
      </p>
      {sub !== undefined && (
        <p className="text-[11px] text-text-muted">{sub}</p>
      )}
    </Card>
  )
}
