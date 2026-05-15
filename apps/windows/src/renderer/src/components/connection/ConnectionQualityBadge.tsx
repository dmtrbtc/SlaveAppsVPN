import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { useConnectionHealth, useConnectionQualityTier } from '../../hooks/useConnectionHealth'
import { HEALTH_STATE_LABELS } from '../../lib/health'
import type { QualityTier } from '../../lib/health'

const TIER_CONFIG: Record<QualityTier, {
  bars: 1 | 2 | 3 | 4
  color: string
  barColor: string
}> = {
  excellent: { bars: 4, color: 'text-connected',  barColor: 'bg-connected'  },
  good:      { bars: 3, color: 'text-connected',  barColor: 'bg-connected'  },
  fair:      { bars: 2, color: 'text-connecting', barColor: 'bg-connecting' },
  poor:      { bars: 1, color: 'text-error',      barColor: 'bg-error'      },
}

interface ConnectionQualityBadgeProps {
  className?: string
}

export function ConnectionQualityBadge({ className }: ConnectionQualityBadgeProps) {
  const health = useConnectionHealth()
  const tier = useConnectionQualityTier()
  const config = TIER_CONFIG[tier]

  const label = health ? HEALTH_STATE_LABELS[health.state] : 'Хорошее'

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
          {label} качество
        </span>
        {health && (
          <span className="text-[10px] text-text-muted font-mono mt-0.5">
            {health.score}/100
          </span>
        )}
      </div>
    </motion.div>
  )
}
