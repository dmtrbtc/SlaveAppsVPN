import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw, Download, Terminal, Cpu, MemoryStick, Info, Activity,
  Wifi, WifiOff, CheckCircle2, XCircle, Shield, Server,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Segmented } from '../components/ui/segmented'
import { InfoTile } from '../components/ui/info-tile'
import { LoadingState, ErrorState } from '../components/ui/states'
import { cn, formatMemoryMb, formatUptime } from '../lib/utils'
import { diagnosticsApi } from '../lib/api'
import { useSystemInfo, useLogs, useConnectivity } from '../hooks/useDiagnostics'
import { useUIStore } from '../stores/ui.store'
import { useDiagnosticsStore, selectEventLog } from '../stores/diagnostics.store'
import type { RuntimeEvent, RuntimeEventSeverity, VPNConnectivityInfo } from '@shared/ipc/types'

const LOG_LEVEL_COLOR: Record<string, string> = {
  error: 'text-error',
  warn:  'text-connecting',
  info:  'text-text-secondary',
  debug: 'text-text-muted',
}

const EVENT_SEVERITY_COLOR: Record<RuntimeEventSeverity, string> = {
  debug:    'text-text-muted',
  info:     'text-text-secondary',
  warning:  'text-connecting',
  error:    'text-error',
  critical: 'text-error font-bold',
}

const LOG_LEVELS = ['all', 'error', 'warn', 'info', 'debug'] as const
type LogFilter = typeof LOG_LEVELS[number]
const LOG_FILTER_OPTIONS = LOG_LEVELS.map(l => ({ value: l, label: l === 'all' ? 'Все' : l.toUpperCase() }))

// ─── Connectivity panel ───────────────────────────────────────────────────────

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-connected" />
        : <XCircle className="h-4 w-4 text-error" />
      }
      <span className="text-[9px] text-text-muted uppercase tracking-wide">{label}</span>
    </div>
  )
}

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-connected' :
    score >= 50 ? 'bg-connecting' :
    'bg-error'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-text-muted w-8 text-right">{score}</span>
    </div>
  )
}

function EngineStateBadge({ state }: { state: string }) {
  const tone: 'ok' | 'warn' | 'bad' | 'neutral' =
    state === 'running' ? 'ok' :
    state === 'starting' || state === 'reconnecting' ? 'warn' :
    state === 'crashed' || state === 'error' ? 'bad' :
    'neutral'
  const label =
    state === 'running' ? 'Запущен' :
    state === 'starting' ? 'Запускается' :
    state === 'stopping' ? 'Останавливается' :
    state === 'crashed' ? 'Аварийно остановлен' :
    state === 'reconnecting' ? 'Переподключение' :
    state === 'error' ? 'Ошибка' :
    'Остановлен'
  return <Badge tone={tone}>{label}</Badge>
}

function ConnectivityPanel({ info }: { info: VPNConnectivityInfo }) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col gap-4">
      {/* Engine + health score row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
            Mihomo Engine
          </span>
          <EngineStateBadge state={info.engineState} />
        </div>
        <div className="flex items-center gap-2 w-32">
          <span className="text-[10px] text-text-muted shrink-0">Health</span>
          <HealthBar score={info.healthScore} />
        </div>
      </div>

      {/* Status dots row */}
      <div className="flex items-center justify-around py-1">
        <StatusDot ok={info.processAlive}  label="Process" />
        <StatusDot ok={info.apiResponding}  label="API" />
        <StatusDot ok={info.tunAvailable}   label="TUN" />
        <StatusDot ok={info.dnsOk}          label="DNS" />
        <StatusDot ok={info.connectivityOk} label="Сеть" />
        <StatusDot ok={info.trafficActive}  label="Трафик" />
      </div>

      {/* Active proxy */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-[11px] text-text-muted">Активный прокси</span>
        </div>
        <div className="flex items-center gap-1.5">
          {info.activeProxy ? (
            <>
              <span className="text-[11px] font-medium text-text-primary truncate max-w-[180px]">
                {info.activeProxy}
              </span>
              {info.proxyCount > 0 && (
                <span className="text-[10px] text-text-muted">
                  из {info.proxyCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-text-muted italic">
              {info.engineState === 'running' ? 'Определяется...' : 'Нет подключения'}
            </span>
          )}
        </div>
      </div>

      {/* Last checked */}
      <div className="flex justify-end">
        <span className="text-[10px] text-text-muted">
          Обновлено: {new Date(info.checkedAt).toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

// ─── Log rows ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: RuntimeEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  return (
    <div className="flex gap-2 px-3 py-1.5 hover:bg-bg-secondary/50 transition-colors">
      <span className="text-text-muted shrink-0 tabular-nums font-mono text-[10px]">{time}</span>
      <span className={cn('shrink-0 uppercase font-semibold text-[10px] w-10', EVENT_SEVERITY_COLOR[event.severity])}>
        {event.severity.slice(0, 4)}
      </span>
      <span className="text-text-secondary text-[10px] break-all">{event.message}</span>
    </div>
  )
}

function LogCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-border bg-bg-primary overflow-hidden', className)}>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DiagnosticsPage() {
  const { notify } = useUIStore()
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const [isExporting, setIsExporting] = useState(false)

  const { data: sysInfo, isLoading: sysLoading, error: sysError, refetch: refetchSys, isFetching: sysFetching } = useSystemInfo()
  const { data: logs = [], isLoading: logsLoading, error: logsError, refetch: refetchLogs, isFetching: logsFetching } = useLogs()
  const { data: connectivity, isFetching: connFetching, refetch: refetchConn } = useConnectivity()
  const eventLog = useDiagnosticsStore(selectEventLog)

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const path = await diagnosticsApi.exportLogs()
      notify({ type: 'success', title: 'Логи экспортированы', message: path })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка экспорта', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsExporting(false)
    }
  }

  const handleRefresh = () => {
    void refetchSys()
    void refetchLogs()
    void refetchConn()
  }

  const isFetching = sysFetching || logsFetching || connFetching

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Диагностика</h2>
            <p className="text-[12px] text-text-muted mt-0.5">Системная информация и логи</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleExport()} disabled={isExporting || logs.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Экспорт
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">

        {/* Connectivity panel */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className="flex items-center gap-1.5 mb-3">
            {connectivity
              ? <Wifi className="h-3.5 w-3.5 text-text-muted" />
              : <WifiOff className="h-3.5 w-3.5 text-text-muted" />
            }
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Подключение
            </p>
          </div>
          {connectivity
            ? <ConnectivityPanel info={connectivity} />
            : (
              <div className="rounded-lg border border-border bg-bg-primary p-4 text-center text-[12px] text-text-muted">
                VPN не запущен
              </div>
            )
          }
        </motion.div>

        {/* System info grid */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.2 }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">Система</p>
          {sysLoading ? (
            <LoadingState label="Сбор информации..." />
          ) : sysError ? (
            <ErrorState error={sysError} retry={() => void refetchSys()} />
          ) : sysInfo ? (
            <div className="grid grid-cols-4 gap-2">
              <InfoTile icon={<Info className="h-3 w-3" />} label="Платформа" value={`${sysInfo.platform} ${sysInfo.arch}`} />
              <InfoTile icon={<Info className="h-3 w-3" />} label="ОС" value={sysInfo.osVersion} />
              <InfoTile icon={<Cpu className="h-3 w-3" />} label="Приложение" value={`v${sysInfo.appVersion}`} />
              <InfoTile icon={<Cpu className="h-3 w-3" />} label="Mihomo" value={sysInfo.mihomoVersion ?? 'N/A'} />
              <InfoTile icon={<MemoryStick className="h-3 w-3" />} label="ОЗУ всего" value={formatMemoryMb(sysInfo.totalMemoryMb)} />
              <InfoTile icon={<MemoryStick className="h-3 w-3" />} label="ОЗУ свободно" value={formatMemoryMb(sysInfo.freeMemoryMb)} />
              <InfoTile icon={<Info className="h-3 w-3" />} label="Аптайм системы" value={formatUptime(Date.now() - sysInfo.uptime * 1000)} />
            </div>
          ) : null}
        </motion.div>

        {/* Runtime events */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Runtime события</p>
            </div>
            <span className="text-[10px] text-text-muted">{eventLog.length} / 200</span>
          </div>
          <LogCard>
            <div className="h-36 overflow-y-auto">
              {eventLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                  <Activity className="h-5 w-5 opacity-40" />
                  <p className="text-[12px]">Событий нет</p>
                </div>
              ) : (
                <div className="font-mono divide-y divide-border/40">
                  {[...eventLog].reverse().map(event => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </LogCard>
        </motion.div>

        {/* Process logs */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Логи</p>
            </div>
            <Segmented
              options={LOG_FILTER_OPTIONS}
              value={logFilter}
              onChange={setLogFilter}
              size="sm"
            />
          </div>

          <LogCard>
            <div className="h-52 overflow-y-auto">
              {logsLoading ? (
                <LoadingState label="Загрузка логов..." />
              ) : logsError ? (
                <ErrorState error={logsError} retry={() => void refetchLogs()} />
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                  <Terminal className="h-5 w-5 opacity-40" />
                  <p className="text-[12px]">Логов нет</p>
                </div>
              ) : (
                <div className="font-mono text-[10px] divide-y divide-border/40">
                  {filteredLogs.slice(-100).reverse().map((entry, i) => (
                    <div key={i} className="flex gap-2 px-3 py-1.5 hover:bg-bg-secondary/50 transition-colors">
                      <span className="text-text-muted shrink-0 tabular-nums">
                        {new Date(entry.time).toLocaleTimeString('ru-RU', {
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </span>
                      <span className={cn('shrink-0 uppercase font-semibold w-8', LOG_LEVEL_COLOR[entry.level] ?? 'text-text-muted')}>
                        {entry.level.slice(0, 4)}
                      </span>
                      <span className="text-text-secondary break-all">{entry.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </LogCard>
        </motion.div>

      </div>
    </div>
  )
}
