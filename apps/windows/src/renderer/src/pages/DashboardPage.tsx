import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown, Clock, Cpu, Globe } from 'lucide-react'
import { ConnectionOrb } from '../components/connection/ConnectionOrb'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { useVpnStore } from '../stores/vpn.store'
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

export function DashboardPage() {
  const { status, traffic, engineVersion } = useVpnStore()
  const [, forceUpdate] = useState(0)

  // Tick uptime counter every second when connected
  useEffect(() => {
    if (status.state !== 'connected') return
    const t = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [status.state])

  const isConnected = status.state === 'connected'
  const flag = countryFlagEmoji(status.countryCode)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-8 px-6 py-8">

        {/* Connection orb */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <ConnectionOrb />
        </motion.div>

        {/* Server + badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="flex flex-col items-center gap-2"
        >
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-base">{flag}</span>
            <span className="font-medium">
              {status.serverName ?? 'Сервер не выбран'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <Badge variant={isConnected ? 'connected' : 'default'} dot={isConnected}>
              {MODE_LABELS[status.mode] ?? status.mode}
            </Badge>
            {status.protocol && (
              <Badge variant="protocol">{PROTOCOL_LABELS[status.protocol] ?? status.protocol}</Badge>
            )}
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.25 }}
          className="grid w-full max-w-sm grid-cols-2 gap-3"
        >
          <StatCard
            label="Загрузка"
            value={formatSpeed(traffic.downloadSpeedBps)}
            total={formatBytes(traffic.sessionDownloadBytes)}
            icon={<ArrowDown className="h-3.5 w-3.5 text-connected" />}
            active={isConnected}
          />
          <StatCard
            label="Отдача"
            value={formatSpeed(traffic.uploadSpeedBps)}
            total={formatBytes(traffic.sessionUploadBytes)}
            icon={<ArrowUp className="h-3.5 w-3.5 text-accent" />}
            active={isConnected}
          />
          <StatCard
            label="Время сессии"
            value={formatUptime(status.connectedAt)}
            icon={<Clock className="h-3.5 w-3.5 text-text-secondary" />}
            active={isConnected}
            mono
          />
          <StatCard
            label="Движок"
            value={engineVersion ? `Mihomo ${engineVersion}` : 'Mihomo'}
            icon={<Cpu className="h-3.5 w-3.5 text-text-secondary" />}
            active={false}
          />
        </motion.div>

        {/* Last error */}
        {status.lastError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-sm rounded-xl border border-error/20 bg-error/8 px-4 py-3"
          >
            <p className="text-xs text-error leading-relaxed">{status.lastError}</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  total?: string
  icon: React.ReactNode
  active: boolean
  mono?: boolean
}

function StatCard({ label, value, total, icon, active, mono }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className={`text-base font-semibold text-text-primary ${mono ? 'font-mono' : ''} ${!active ? 'opacity-40' : ''}`}>
        {active ? value : (mono ? '00:00:00' : '0 B/s')}
      </p>
      {total !== undefined && (
        <p className="text-[11px] text-text-muted">{active ? total : '0 B'}</p>
      )}
    </Card>
  )
}
