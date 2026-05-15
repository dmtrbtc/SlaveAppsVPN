import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

// Quality tiers — latencyMs is the primary signal.
// When not available (null), falls back to a stable "good" default.
// Wire latencyMs from IPC when the endpoint exposes per-connection ping.
type QualityTier = 'excellent' | 'good' | 'fair' | 'poor'

function getTier(latencyMs: number | null): QualityTier {
  if (latencyMs === null) return 'good'
  if (latencyMs < 50) return 'excellent'
  if (latencyMs < 120) return 'good'
  if (latencyMs < 250) return 'fair'
  return 'poor'
}

const TIER_CONFIG: Record<QualityTier, {
  bars: 1 | 2 | 3 | 4
  label: string
  color: string
  barColor: string
}> = {
  excellent: { bars: 4, label: 'Отличное',    color: 'text-connected',   barColor: 'bg-connected'   },
  good:      { bars: 3, label: 'Хорошее',     color: 'text-connected',   barColor: 'bg-connected'   },
  fair:      { bars: 2, label: 'Среднее',     color: 'text-connecting',  barColor: 'bg-connecting'  },
  poor:      { bars: 1, label: 'Слабое',      color: 'text-error',       barColor: 'bg-error'       },
}

interface ConnectionQualityBadgeProps {
  latencyMs?: number | null
  className?: string
}

export function ConnectionQualityBadge({ latencyMs = null, className }: ConnectionQualityBadgeProps) {
  const tier = getTier(latencyMs)
  const config = TIER_CONFIG[tier]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border/60 bg-bg-primary/80 px-3 py-2',
        className
      )}
    >
      {/* Signal bars */}
      <div className="flex items-end gap-[3px] h-4">
        {[1, 2, 3, 4].map(bar => (
          <motion.div
            key={bar}
            className={cn(
              'w-1 rounded-sm transition-colors duration-500',
              bar <= config.bars ? config.barColor : 'bg-bg-tertiary'
            )}
            style={{ height: `${bar * 25}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: bar * 0.06, duration: 0.3, ease: 'backOut' }}
          />
        ))}
      </div>

      {/* Label */}
      <div className="flex flex-col leading-none">
        <span className={cn('text-[11px] font-medium', config.color)}>
          {config.label} качество
        </span>
        {latencyMs !== null && (
          <span className="text-[10px] text-text-muted font-mono mt-0.5">
            {latencyMs}ms
          </span>
        )}
      </div>
    </motion.div>
  )
}
