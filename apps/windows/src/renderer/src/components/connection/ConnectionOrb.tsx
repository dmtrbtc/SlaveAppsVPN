import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, ShieldOff, ShieldAlert, Loader2 } from 'lucide-react'
import type { VPNConnectionState } from '@slave-vpn/shared'
import { cn } from '../../lib/utils'
import { useVpnStore } from '../../stores/vpn.store'

const STATE_CONFIG = {
  connected: {
    orbClass: 'orb-connected shadow-connected',
    ringColor: '#22c55e',
    ringOpacity: 0.8,
    Icon: ShieldCheck,
    iconColor: '#22c55e',
    label: 'Защищено',
    sublabel: 'Нажмите чтобы отключить',
  },
  connecting: {
    orbClass: 'orb-connecting',
    ringColor: '#f59e0b',
    ringOpacity: 0.6,
    Icon: Loader2,
    iconColor: '#f59e0b',
    label: 'Подключение...',
    sublabel: 'Устанавливается туннель',
  },
  reconnecting: {
    orbClass: 'orb-connecting',
    ringColor: '#f59e0b',
    ringOpacity: 0.6,
    Icon: Loader2,
    iconColor: '#f59e0b',
    label: 'Переподключение...',
    sublabel: 'Восстановление соединения',
  },
  disconnecting: {
    orbClass: 'orb-disconnected',
    ringColor: '#52526a',
    ringOpacity: 0.4,
    Icon: Loader2,
    iconColor: '#52526a',
    label: 'Отключение...',
    sublabel: '',
  },
  disconnected: {
    orbClass: 'orb-disconnected',
    ringColor: '#2a2a38',
    ringOpacity: 0.6,
    Icon: ShieldOff,
    iconColor: '#52526a',
    label: 'Не защищено',
    sublabel: 'Нажмите чтобы подключить',
  },
  error: {
    orbClass: 'orb-error shadow-error',
    ringColor: '#ef4444',
    ringOpacity: 0.7,
    Icon: ShieldAlert,
    iconColor: '#ef4444',
    label: 'Ошибка',
    sublabel: 'Нажмите чтобы повторить',
  },
} satisfies Record<VPNConnectionState, {
  orbClass: string
  ringColor: string
  ringOpacity: number
  Icon: React.ComponentType<{ className?: string }>
  iconColor: string
  label: string
  sublabel: string
}>

interface ConnectionOrbProps {
  className?: string
}

export function ConnectionOrb({ className }: ConnectionOrbProps) {
  const { status, isConnecting, isDisconnecting, connect, disconnect } = useVpnStore()
  const state = status.state
  const config = STATE_CONFIG[state]
  const isLoading = isConnecting || isDisconnecting ||
    state === 'connecting' || state === 'disconnecting' || state === 'reconnecting'
  const isSpinning = state === 'connecting' || state === 'reconnecting' || state === 'disconnecting'

  const handleClick = useCallback(() => {
    if (isLoading) return
    if (state === 'connected') void disconnect()
    else void connect()
  }, [state, isLoading, connect, disconnect])

  return (
    <div className={cn('flex flex-col items-center gap-5', className)}>
      <motion.button
        onClick={handleClick}
        disabled={isSpinning}
        className={cn(
          'relative flex h-44 w-44 items-center justify-center rounded-full transition-shadow duration-500',
          config.orbClass,
          !isLoading && 'cursor-pointer hover:brightness-110 active:scale-95',
          isLoading && 'cursor-not-allowed'
        )}
        whileHover={!isLoading ? { scale: 1.02 } : undefined}
        whileTap={!isLoading ? { scale: 0.97 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        {/* Outer ping ring — only when connected */}
        <AnimatePresence>
          {state === 'connected' && (
            <motion.div
              key="ping"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full animate-ping-slow"
              style={{ background: `radial-gradient(circle, transparent 45%, ${config.ringColor}22 70%, transparent 100%)` }}
            />
          )}
        </AnimatePresence>

        {/* Main ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: state === 'connected'
              ? [`0 0 0 2px ${config.ringColor}99`, `0 0 0 2px ${config.ringColor}cc`, `0 0 0 2px ${config.ringColor}99`]
              : `0 0 0 1.5px ${config.ringColor}${Math.round(config.ringOpacity * 255).toString(16)}`,
          }}
          transition={state === 'connected' ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}
        />

        {/* Spinning ring for connecting states */}
        <AnimatePresence>
          {isSpinning && (
            <motion.div
              key="spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{ rotate: { duration: 1.5, repeat: Infinity, ease: 'linear' } }}
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent 75%, ${config.ringColor} 100%)`,
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))',
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))',
              }}
            />
          )}
        </AnimatePresence>

        {/* Icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={state}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
          >
            <config.Icon
              className={cn(
                'h-14 w-14',
                isSpinning && 'animate-spin-slow'
              )}
              style={{ color: config.iconColor }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.button>

      {/* Status labels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-1 text-center"
        >
          <span
            className="text-base font-semibold"
            style={{ color: config.iconColor }}
          >
            {config.label}
          </span>
          {config.sublabel && (
            <span className="text-xs text-text-muted">{config.sublabel}</span>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
