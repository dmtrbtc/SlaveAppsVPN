import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw, Download, Terminal, Cpu, MemoryStick, Info, Activity,
  Wifi, WifiOff, CheckCircle2, XCircle, Shield, Server, Lock, AlertCircle,
  Database, Zap, RotateCcw, Search, Stethoscope, MinusCircle, Loader2,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Segmented } from '../components/ui/segmented'
import { InfoTile } from '../components/ui/info-tile'
import { LoadingState, ErrorState } from '../components/ui/states'
import { cn, formatMemoryMb, formatUptime } from '../lib/utils'
import { diagnosticsApi, dnsApi } from '../lib/api'
import { useSystemInfo, useLogs, useConnectivity, useStartupReport, useConfigSourceMeta } from '../hooks/useDiagnostics'
import { useUIStore } from '../stores/ui.store'
import { useDiagnosticsStore, selectEventLog } from '../stores/diagnostics.store'
import type { RuntimeEvent, RuntimeEventSeverity, VPNConnectivityInfo, StartupPhaseEntry, DnsLeakReport, SelfTestReport, SelfTestStatus } from '@shared/ipc/types'

const LOG_LEVEL_COLOR: Record<string, string> = {
  error: 'text-error',
  fatal: 'text-error',
  warn:  'text-connecting',
  info:  'text-text-secondary',
  debug: 'text-text-muted',
  trace: 'text-text-muted',
}

// Pino encodes level as a number (30=info, 40=warn, 50=error, 60=fatal).
function pinoLevelToString(level: unknown): string {
  if (typeof level === 'string') return level
  if (typeof level === 'number') {
    if (level >= 60) return 'fatal'
    if (level >= 50) return 'error'
    if (level >= 40) return 'warn'
    if (level >= 30) return 'info'
    if (level >= 20) return 'debug'
    return 'trace'
  }
  return 'info'
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

// ─── Startup phases panel ─────────────────────────────────────────────────────

function StartupPhasesPanel({ phases, totalMs }: { phases: StartupPhaseEntry[]; totalMs: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Фазы запуска</span>
        <span className={cn(
          'text-[10px] font-mono',
          totalMs > 20000 ? 'text-error' : totalMs > 10000 ? 'text-connecting' : 'text-connected'
        )}>
          {(totalMs / 1000).toFixed(1)}s total
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {phases.map(p => (
          <div key={p.phase} className="flex items-center gap-2">
            {p.error
              ? <XCircle className="h-3 w-3 text-error shrink-0" />
              : p.completedAt !== null
                ? <CheckCircle2 className="h-3 w-3 text-connected shrink-0" />
                : <div className="h-3 w-3 rounded-full border-2 border-connecting/40 border-t-connecting animate-spin shrink-0" />
            }
            <span className="flex-1 text-[10px] text-text-secondary truncate">{p.label}</span>
            {p.durationMs !== null && (
              <span className={cn(
                'text-[10px] font-mono shrink-0',
                p.durationMs > 5000 ? 'text-error' : p.durationMs > 2000 ? 'text-connecting' : 'text-text-muted'
              )}>
                {p.durationMs}ms
              </span>
            )}
            {p.error && (
              <span className="text-[9px] text-error truncate max-w-[100px]" title={p.error}>
                {p.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

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

      {/* Active proxy + security info */}
      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-[11px] text-text-muted">Активный прокси</span>
          </div>
          <div className="flex items-center gap-1.5">
            {info.activeProxy ? (
              <>
                <span className="text-[11px] font-medium text-text-primary truncate max-w-[160px]">
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

        {/* Reality / TLS status */}
        {info.realityStatus && info.realityStatus !== 'none' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-[11px] text-text-muted">Безопасность</span>
            </div>
            {info.realityStatus === 'reality' ? (
              <Badge tone="warn">REALITY</Badge>
            ) : (
              <Badge tone="neutral">TLS</Badge>
            )}
          </div>
        )}

        {/* Mihomo API URL */}
        {info.apiUrl && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-[11px] text-text-muted">API</span>
            </div>
            <span className="text-[10px] font-mono text-text-secondary">
              {info.apiUrl}
              {' '}
              <span className={cn(info.apiResponding ? 'text-connected' : 'text-error')}>
                {info.apiResponding ? '●' : '○'}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Captive portal / suggestion */}
      {info.captivePortal && (
        <div className="rounded-md bg-connecting/10 border border-connecting/30 px-3 py-2 text-[11px] text-connecting">
          Captive portal — подключитесь к сети через браузер
        </div>
      )}
      {info.suggestion && !info.captivePortal && (
        <div className="rounded-md bg-bg-secondary px-3 py-2 text-[11px] text-text-secondary">
          {info.suggestion}
        </div>
      )}
      {info.quarantinedNodes !== undefined && info.quarantinedNodes > 0 && (
        <div className="text-[10px] text-text-muted">
          {info.quarantinedNodes} узлов в карантине
        </div>
      )}

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

// ─── Self-test panel ──────────────────────────────────────────────────────────

const SELF_TEST_ICON: Record<SelfTestStatus, React.ReactNode> = {
  ok:       <CheckCircle2 className="h-3.5 w-3.5 text-connected shrink-0" />,
  warning:  <AlertCircle  className="h-3.5 w-3.5 text-connecting shrink-0" />,
  error:    <XCircle      className="h-3.5 w-3.5 text-error shrink-0" />,
  skipped:  <MinusCircle  className="h-3.5 w-3.5 text-text-muted shrink-0" />,
}

const SELF_TEST_OVERALL_TONE: Record<SelfTestStatus, string> = {
  ok:      'border-connected/30 bg-connected/5 text-connected',
  warning: 'border-connecting/30 bg-connecting/5 text-connecting',
  error:   'border-error/30 bg-error/5 text-error',
  skipped: 'border-border bg-bg-secondary text-text-muted',
}

const SELF_TEST_OVERALL_LABEL: Record<SelfTestStatus, string> = {
  ok: 'Всё в порядке',
  warning: 'Есть предупреждения',
  error: 'Найдены проблемы',
  skipped: 'Пропущено',
}

function SelfTestPanel() {
  const { notify } = useUIStore()
  const [report, setReport] = useState<SelfTestReport | null>(null)
  const [running, setRunning] = useState(false)

  const handleRun = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    try {
      const r = await diagnosticsApi.selfTest()
      setReport(r)
      if (r.overall === 'error') {
        notify({ type: 'error', title: 'Найдены проблемы', message: 'См. результаты теста' })
      } else if (r.overall === 'warning') {
        notify({ type: 'warning', title: 'Предупреждения', message: 'См. результаты теста' })
      } else {
        notify({ type: 'success', title: 'Self-test OK', message: 'Все проверки пройдены' })
      }
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка self-test', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] font-semibold text-text-primary">Self-test</p>
          <p className="text-[11px] text-text-muted">
            Проверка binaries, geo баз, портов, прав, подписок
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void handleRun()} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
          {running ? 'Тестируем...' : 'Запустить'}
        </Button>
      </div>

      {report && (
        <>
          <div className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 mb-2',
            SELF_TEST_OVERALL_TONE[report.overall],
          )}>
            {SELF_TEST_ICON[report.overall]}
            <span className="text-[12px] font-medium">{SELF_TEST_OVERALL_LABEL[report.overall]}</span>
            <span className="ml-auto text-[10px] text-text-muted font-mono">{report.totalMs} ms</span>
          </div>

          <div className="rounded-md border border-border bg-bg-secondary divide-y divide-border/40">
            {report.checks.map(check => (
              <div key={check.id} className="flex items-start gap-2 px-3 py-1.5">
                {SELF_TEST_ICON[check.status]}
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-text-secondary font-medium">{check.label}</span>
                  <div className="text-[10px] text-text-muted leading-tight break-words">{check.detail}</div>
                </div>
                <span className="text-[9px] text-text-muted font-mono shrink-0 mt-0.5">{check.durationMs}ms</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── DNS leak test panel ─────────────────────────────────────────────────────

function DnsLeakPanel() {
  const { notify } = useUIStore()
  const [report, setReport] = useState<DnsLeakReport | null>(null)
  const [running, setRunning] = useState(false)

  const handleRun = async () => {
    if (running) return
    setRunning(true)
    try {
      const result = await dnsApi.leakTest()
      setReport(result)
      if (result.leaked) {
        notify({ type: 'warning', title: 'Возможна утечка DNS', message: result.warning ?? 'См. результат' })
      } else {
        notify({ type: 'success', title: 'Утечек не обнаружено', message: 'DNS-резолвер ожидаемый' })
      }
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка теста', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[12px] font-semibold text-text-primary">DNS Leak Test</p>
          <p className="text-[11px] text-text-muted">Проверка реального резолвера и публичного IP</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void handleRun()} disabled={running}>
          <Search className={cn('h-3.5 w-3.5', running && 'animate-pulse')} />
          {running ? 'Тестируем...' : 'Запустить'}
        </Button>
      </div>

      {report && (
        <div className="flex flex-col gap-2 mt-3">
          {/* Verdict */}
          <div className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2',
            report.leaked
              ? 'border-error/30 bg-error/5 text-error'
              : 'border-connected/30 bg-connected/5 text-connected',
          )}>
            {report.leaked ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="text-[12px] font-medium">
              {report.leaked ? 'Возможна утечка' : 'Утечек не обнаружено'}
            </span>
          </div>

          {report.warning && (
            <p className="text-[11px] text-text-muted">{report.warning}</p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-1">
            <InfoTile
              icon={<Wifi className="h-3.5 w-3.5" />}
              label="Публичный IP"
              value={report.publicIp ?? '—'}
            />
            <InfoTile
              icon={<Server className="h-3.5 w-3.5" />}
              label="Локация / colo"
              value={[report.publicCountry, report.publicColo].filter(Boolean).join(' / ') || '—'}
            />
          </div>

          <div className="rounded-md border border-border bg-bg-secondary px-3 py-2">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">
              Резолверы, ответившие на запрос
            </p>
            {report.resolvers.length === 0 ? (
              <span className="text-[11px] text-text-muted">Не удалось определить</span>
            ) : (
              <div className="flex flex-col gap-1">
                {report.resolvers.map((r, i) => (
                  <code key={i} className="text-[11px] text-text-secondary font-mono break-all">
                    {r.ip ?? '—'}
                  </code>
                ))}
              </div>
            )}
          </div>

          {report.expectedResolverHosts.length > 0 && (
            <div className="rounded-md border border-border bg-bg-secondary px-3 py-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                Ожидаемые хосты (по настройкам)
              </p>
              <div className="flex flex-wrap gap-1">
                {report.expectedResolverHosts.map(h => (
                  <Badge key={h} tone="neutral" className="text-[10px] font-mono">{h}</Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-text-muted text-right">
            Тест занял {report.durationMs} ms
          </p>
        </div>
      )}
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
  const { data: startupReport } = useStartupReport()
  const { data: configSourceMeta } = useConfigSourceMeta()
  const eventLog = useDiagnosticsStore(selectEventLog)

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => pinoLevelToString(l.level) === logFilter)

  const lastError = useMemo(
    () => [...eventLog].reverse().find(e => e.severity === 'error' || e.severity === 'critical'),
    [eventLog]
  )

  const reconnectCount = useMemo(
    () => eventLog.filter(e => e.kind === 'reconnect.attempt').length,
    [eventLog]
  )

  const lastErrors = useMemo(
    () => eventLog.filter(e => e.severity === 'error' || e.severity === 'critical').slice(-10).reverse(),
    [eventLog]
  )

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

        {/* Startup phases */}
        {startupReport && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.2 }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3.5 w-3.5 text-text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Запуск</p>
            </div>
            <StartupPhasesPanel phases={startupReport.phases} totalMs={startupReport.totalMs} />
          </motion.div>
        )}

        {/* Self-test */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.2 }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Stethoscope className="h-3.5 w-3.5 text-text-muted" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Self-test</p>
          </div>
          <SelfTestPanel />
        </motion.div>

        {/* DNS leak test */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Проверка DNS</p>
          </div>
          <DnsLeakPanel />
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
              {configSourceMeta && (
                <InfoTile
                  icon={<Database className="h-3 w-3" />}
                  label="Config source"
                  value={configSourceMeta.displayName}
                />
              )}
              {reconnectCount > 0 && (
                <InfoTile
                  icon={<RotateCcw className="h-3 w-3" />}
                  label="Реконнектов"
                  value={String(reconnectCount)}
                />
              )}
            </div>
          ) : null}
        </motion.div>

        {/* Last classified error */}
        {lastError && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.2 }}>
            <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-error shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-semibold text-error uppercase tracking-wide">
                    {lastError.kind ?? 'ОШИБКА'}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {new Date(lastError.timestamp).toLocaleTimeString('ru-RU', {
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary break-all">{lastError.message}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Runtime events */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Runtime события</p>
              {reconnectCount > 0 && (
                <Badge tone="warn">{reconnectCount} реконн.</Badge>
              )}
              {lastErrors.length > 0 && (
                <Badge tone="bad">{lastErrors.length} ошибок</Badge>
              )}
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
                      <span className={cn('shrink-0 uppercase font-semibold w-8', LOG_LEVEL_COLOR[pinoLevelToString(entry.level)] ?? 'text-text-muted')}>
                        {pinoLevelToString(entry.level).slice(0, 4)}
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
