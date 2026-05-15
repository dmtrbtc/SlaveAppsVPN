import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ReconnectDisplayProps {
  attempts: number
  startedAt: number | null
}

function useElapsed(startedAt: number | null): string {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!startedAt) { setElapsed(''); return }

    const update = () => {
      const diff = Math.floor((Date.now() - startedAt) / 1000)
      if (diff < 60) {
        setElapsed(`${diff}с`)
      } else {
        const m = Math.floor(diff / 60)
        const s = diff % 60
        setElapsed(`${m}м ${s}с`)
      }
    }

    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  return elapsed
}

// Visual exponential backoff progress — pure cosmetic
function BackoffBar({ attempts }: { attempts: number }) {
  const maxAttempts = 5
  const pct = Math.min(100, (attempts / maxAttempts) * 100)

  return (
    <div className="w-full h-0.5 rounded-full bg-bg-tertiary overflow-hidden">
      <motion.div
        className={cn(
          'h-full rounded-full transition-colors duration-500',
          attempts >= 4 ? 'bg-error' : attempts >= 2 ? 'bg-connecting' : 'bg-accent'
        )}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  )
}

export function ReconnectDisplay({ attempts, startedAt }: ReconnectDisplayProps) {
  const elapsed = useElapsed(startedAt)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-sm"
    >
      <div className="rounded-2xl border border-connecting/25 bg-connecting/5 px-4 py-3 flex flex-col gap-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 text-connecting animate-spin" style={{ animationDuration: '2s' }} />
            <span className="text-xs font-medium text-text-primary">Переподключение</span>
          </div>
          {elapsed && (
            <span className="text-[10px] text-text-muted font-mono">{elapsed}</span>
          )}
        </div>

        {/* Attempt info */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-text-muted">
            Попытка <span className="text-text-secondary font-medium">{attempts}</span>
          </span>
          <span className={cn(
            'font-medium',
            attempts >= 4 ? 'text-error' : attempts >= 2 ? 'text-connecting' : 'text-text-muted'
          )}>
            {attempts === 1 ? 'первая попытка' :
             attempts >= 4 ? 'много попыток...' : 'повтор с задержкой'}
          </span>
        </div>

        <BackoffBar attempts={attempts} />

        {attempts >= 4 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-error/80 leading-relaxed"
          >
            Соединение нестабильно. Проверьте подключение к интернету.
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}
