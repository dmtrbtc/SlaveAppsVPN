import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, X, RotateCcw, Download } from 'lucide-react'
import { Button } from '../ui/button'
import { useSafeModeStatus, useSafeModeReset } from '../../hooks/useSafeMode'
import { diagnosticsApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'

export function SafeModeBanner() {
  const { data: status } = useSafeModeStatus()
  const { mutate: reset, isPending: isResetting } = useSafeModeReset()
  const { notify } = useUIStore()
  const [dismissed, setDismissed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const active = status?.active === true && !dismissed

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const path = await diagnosticsApi.exportLogs()
      notify({ type: 'success', title: 'Логи экспортированы', message: path })
    } catch {
      notify({ type: 'error', title: 'Ошибка экспорта', message: 'Попробуйте позже' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="relative z-50 border-b border-orange-500/30 bg-orange-500/10 px-4 py-2.5"
          role="alert"
          aria-label="Safe mode active"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-orange-300">
                Безопасный режим
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Обнаружен цикл сбоев ({status?.launchCount ?? 0} запусков). Автоподключение отключено.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => reset()}
                  loading={isResetting}
                  aria-label="Reset safe mode"
                >
                  <RotateCcw className="h-3 w-3" />
                  Сбросить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleExport()}
                  loading={isExporting}
                  aria-label="Export diagnostics"
                >
                  <Download className="h-3 w-3" />
                  Диагностика
                </Button>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Dismiss safe mode banner"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
