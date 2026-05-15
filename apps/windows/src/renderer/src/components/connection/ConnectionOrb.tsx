import { useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion'
import { ShieldCheck, ShieldOff, ShieldAlert, Loader2 } from 'lucide-react'
import type { VPNConnectionState } from '@slave-vpn/shared'
import { cn } from '../../lib/utils'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import { useConnectionHealth } from '../../hooks/useConnectionHealth'

const STATE_CONFIG = {
  connected: {
    ringColor: '#22c55e',
    ringOpacity: 0.9,
    Icon: ShieldCheck,
    iconColor: '#22c55e',
    label: 'Защищено',
    sublabel: 'Нажмите чтобы отключить',
    bg: 'bg-connected/10',
    border: 'border-connected/30',
  },
  connecting: {
    ringColor: '#f59e0b',
    ringOpacity: 0.6,
    Icon: Loader2,
    iconColor: '#f59e0b',
    label: 'Подключение...',
    sublabel: 'Устанавливается туннель',
    bg: 'bg-connecting/10',
    border: 'border-connecting/20',
  },
  reconnecting: {
    ringColor: '#f59e0b',
    ringOpacity: 0.6,
    Icon: Loader2,
    iconColor: '#f59e0b',
    label: 'Переподключение...',
    sublabel: 'Восстановление соединения',
    bg: 'bg-connecting/10',
    border: 'border-connecting/20',
  },
  disconnecting: {
    ringColor: '#52526a',
    ringOpacity: 0.4,
    Icon: Loader2,
    iconColor: '#52526a',
    label: 'Отключение...',
    sublabel: '',
    bg: 'bg-bg-secondary',
    border: 'border-border/30',
  },
  disconnected: {
    ringColor: '#2a2a38',
    ringOpacity: 0.6,
    Icon: ShieldOff,
    iconColor: '#52526a',
    label: 'Не защищено',
    sublabel: 'Нажмите чтобы подключить',
    bg: 'bg-bg-secondary',
    border: 'border-border/40',
  },
  error: {
    ringColor: '#ef4444',
    ringOpacity: 0.7,
    Icon: ShieldAlert,
    iconColor: '#ef4444',
    label: 'Ошибка',
    sublabel: 'Нажмите чтобы повторить',
    bg: 'bg-error/10',
    border: 'border-error/30',
  },
} satisfies Record<VPNConnectionState, {
  ringColor: string
  ringOpacity: number
  Icon: React.ComponentType<{ className?: string }>
  iconColor: string
  label: string
  sublabel: string
  bg: string
  border: string
}>

const TRANSITIONING: VPNConnectionState[] = ['connecting', 'disconnecting', 'reconnecting']

interface ConnectionOrbProps {
  className?: string
}

export function ConnectionOrb({ className }: ConnectionOrbProps) {
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)
  const health = useConnectionHealth()
  const prefersReducedMotion = useReducedMotion()

  const config = STATE_CONFIG[state]
  const isTransitioning = TRANSITIONING.includes(state)
  const isDegraded = state === 'connected' && health !== null && health.state !== 'healthy'

  const handleClick = useCallback(() => {
    if (isTransitioning) return
    if (state === 'connected') void disconnect()
    else void connect()
  }, [state, isTransitioning, connect, disconnect])

  const effectiveRingColor = isDegraded ? '#f59e0b' : config.ringColor

  return (
    <LayoutGroup id="connection-orb">
      <div className={cn('flex flex-col items-center gap-4', className)}>
        <motion.button
          onClick={handleClick}
          disabled={isTransitioning}
          className={cn(
            'relative flex h-32 w-32 items-center justify-center rounded-full border',
            config.bg,
            isDegraded ? 'border-connecting/40' : config.border,
            'transition-colors duration-500',
            !isTransitioning && 'cursor-pointer',
            isTransitioning && 'cursor-not-allowed',
          )}
          whileHover={!isTransitioning && !prefersReducedMotion ? { scale: 1.03 } : undefined}
          whileTap={!isTransitioning && !prefersReducedMotion ? { scale: 0.97 } : undefined}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          aria-label={config.label}
        >
          {/* Pulse ring — connected state only */}
          <AnimatePresence>
            {state === 'connected' && !prefersReducedMotion && (
              <motion.div
                key="pulse"
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.5, 0, 0.5] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  boxShadow: `0 0 0 8px ${effectiveRingColor}18`,
                }}
              />
            )}
          </AnimatePresence>

          {/* Precision border ring */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{
              boxShadow: state === 'connected' && !prefersReducedMotion
                ? [
                    `0 0 0 1.5px ${effectiveRingColor}70`,
                    `0 0 0 1.5px ${effectiveRingColor}b0`,
                    `0 0 0 1.5px ${effectiveRingColor}70`,
                  ]
                : `0 0 0 1.5px ${effectiveRingColor}${Math.round(config.ringOpacity * 255).toString(16).padStart(2, '0')}`,
            }}
            transition={state === 'connected' && !prefersReducedMotion
              ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.4 }
            }
          />

          {/* Spinner arc — transitioning states */}
          <AnimatePresence>
            {isTransitioning && !prefersReducedMotion && (
              <motion.div
                key="spinner-arc"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.2 },
                  rotate: { duration: 1.2, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute inset-[-3px] rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, transparent 70%, ${config.ringColor} 100%)`,
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), black calc(100% - 2.5px))',
                  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), black calc(100% - 2.5px))',
                }}
              />
            )}
          </AnimatePresence>

          {/* Degraded indicator dot */}
          <AnimatePresence>
            {isDegraded && (
              <motion.div
                key="degraded-dot"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-connecting border-2 border-bg-base"
              />
            )}
          </AnimatePresence>

          {/* Icon */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${state}-${isDegraded ? 'deg' : 'ok'}`}
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <config.Icon
                className={cn(
                  'h-10 w-10',
                  isTransitioning && !prefersReducedMotion && 'animate-spin-slow',
                )}
                style={{ color: isDegraded ? '#f59e0b' : config.iconColor }}
              />
            </motion.div>
          </AnimatePresence>
        </motion.button>

        {/* Status labels */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state}-label`}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -5 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="flex flex-col items-center gap-0.5 text-center"
          >
            <span
              className="text-sm font-semibold"
              style={{ color: isDegraded ? '#f59e0b' : config.iconColor }}
            >
              {isDegraded ? 'Нестабильно' : config.label}
            </span>
            <span className="text-xs text-text-muted">
              {isDegraded
                ? health?.state === 'dns_failure' ? 'Ошибка DNS'
                  : health?.state === 'offline' ? 'Нет интернета'
                  : health?.state === 'tunnel_unstable' ? 'Туннель нестабилен'
                  : 'Деградация соединения'
                : config.sublabel}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </LayoutGroup>
  )
}
