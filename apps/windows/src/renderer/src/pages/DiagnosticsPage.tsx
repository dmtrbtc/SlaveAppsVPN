import { useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Download, Terminal, Cpu, MemoryStick, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Spinner } from '../components/ui/spinner'
import { cn } from '../lib/utils'
import { ipc } from '../lib/ipc'
import { useUIStore } from '../stores/ui.store'
import type { SystemInfo, LogEntry } from '@shared/ipc/types'

const LOG_LEVEL_COLOR: Record<string, string> = {
  error: 'text-error',
  warn: 'text-connecting',
  info: 'text-text-secondary',
  debug: 'text-text-muted',
}

function formatBytes(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}ч ${m}м` : `${m}м`
}

export function DiagnosticsPage() {
  const { notify } = useUIStore()
  const [logFilter, setLogFilter] = useState<string>('all')
  const [isExporting, setIsExporting] = useState(false)

  const { data: sysInfo, isLoading: sysLoading, refetch: refetchSys, isFetching: sysFetching } = useQuery({
    queryKey: ['diagnostics', 'system'],
    queryFn: async (): Promise<SystemInfo> => {
      const result = await ipc.diagnostics.collect()
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    staleTime: 30_000,
    retry: 1,
  })

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs, isFetching: logsFetching } = useQuery({
    queryKey: ['diagnostics', 'logs'],
    queryFn: async (): Promise<LogEntry[]> => {
      const result = await ipc.diagnostics.getLogs()
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    staleTime: 10_000,
    retry: 1,
  })

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await ipc.diagnostics.exportLogs()
      if (!result.ok) throw new Error(result.error.message)
      notify({ type: 'success', title: 'Логи экспортированы', message: result.data })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка экспорта', message: String(err) })
    } finally {
      setIsExporting(false)
    }
  }

  const handleRefresh = () => {
    void refetchSys()
    void refetchLogs()
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text-primary mb-0.5">Диагностика</h1>
            <p className="text-xs text-text-muted">Системная информация и логи</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={sysFetching || logsFetching}>
              <RefreshCw className={cn('h-3.5 w-3.5', (sysFetching || logsFetching) && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={isExporting}>
              {isExporting ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
              Экспорт
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* System info */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2 px-1">Система</p>
          {sysLoading ? (
            <div className="flex items-center justify-center h-20"><Spinner /></div>
          ) : sysInfo ? (
            <div className="grid grid-cols-2 gap-2">
              <InfoTile icon={<Info className="h-3 w-3" />} label="Платформа" value={`${sysInfo.platform} ${sysInfo.arch}`} />
              <InfoTile icon={<Info className="h-3 w-3" />} label="ОС" value={sysInfo.osVersion} />
              <InfoTile icon={<Cpu className="h-3 w-3" />} label="Приложение" value={`v${sysInfo.appVersion}`} />
              <InfoTile icon={<Cpu className="h-3 w-3" />} label="Mihomo" value={sysInfo.mihomoVersion ?? 'N/A'} />
              <InfoTile icon={<MemoryStick className="h-3 w-3" />} label="ОЗУ всего" value={formatBytes(sysInfo.totalMemoryMb)} />
              <InfoTile icon={<MemoryStick className="h-3 w-3" />} label="ОЗУ свободно" value={formatBytes(sysInfo.freeMemoryMb)} />
              <InfoTile icon={<Info className="h-3 w-3" />} label="Аптайм системы" value={formatUptime(sysInfo.uptime)} />
            </div>
          ) : (
            <div className="text-center text-xs text-text-muted py-4">Не удалось получить данные</div>
          )}
        </motion.div>

        {/* Logs */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.2 }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] text-text-muted uppercase tracking-wider">Логи</p>
            <div className="flex gap-1">
              {(['all', 'error', 'warn', 'info', 'debug'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setLogFilter(level)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
                    logFilter === level
                      ? 'bg-accent/15 text-text-accent'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  {level === 'all' ? 'Все' : level.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="h-48 overflow-y-auto">
              {logsLoading ? (
                <div className="flex items-center justify-center h-full"><Spinner /></div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                  <Terminal className="h-5 w-5 opacity-40" />
                  <p className="text-xs">Логов нет</p>
                </div>
              ) : (
                <div className="font-mono text-[10px] divide-y divide-border/30">
                  {filteredLogs.slice(-100).reverse().map((entry, i) => (
                    <div key={i} className="flex gap-2 px-3 py-1.5 hover:bg-bg-elevated/50 transition-colors">
                      <span className="text-text-muted shrink-0 tabular-nums">
                        {new Date(entry.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-2 py-2">
      <span className="text-text-muted shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-text-muted">{label}</p>
        <p className="text-xs text-text-primary font-medium truncate">{value}</p>
      </div>
    </Card>
  )
}
