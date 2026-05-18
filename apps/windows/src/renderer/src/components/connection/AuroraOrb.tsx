import { useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Shield } from 'lucide-react'
import type { VPNConnectionState } from '@slave-vpn/shared'
import { cn } from '../../lib/utils'

const STATE_LABELS: Record<VPNConnectionState, string> = {
  disconnected:  'Защитить меня',
  connecting:    'Подключаем...',
  connected:     'Защищено',
  disconnecting: 'Отключаем...',
  reconnecting:  'Подключаем...',
  error:         'Ошибка',
}

// Gradient colors per state (light-mode Aurora palette)
const STATE_GRADIENT: Record<VPNConnectionState, { from: string; to: string; glow: string }> = {
  disconnected:  { from: '#9b94a6', to: '#c8bfb0', glow: 'rgba(155,148,166,0.20)' },
  connecting:    { from: '#d97706', to: '#ff7a59', glow: 'rgba(217,119,6,0.35)' },
  reconnecting:  { from: '#d97706', to: '#ff7a59', glow: 'rgba(217,119,6,0.35)' },
  connected:     { from: '#ff7a59', to: '#5b8def', glow: 'rgba(15,168,107,0.40)' },
  disconnecting: { from: '#d97706', to: '#ff7a59', glow: 'rgba(217,119,6,0.25)' },
  error:         { from: '#e23636', to: '#ff7a59', glow: 'rgba(226,54,54,0.35)' },
}

const RING_GRADIENT: Record<VPNConnectionState, string> = {
  disconnected:  'conic-gradient(from 0deg, rgba(155,148,166,0.15) 0%, rgba(155,148,166,0.05) 100%)',
  connecting:    'conic-gradient(from 0deg, #d97706 0%, #ff7a59 40%, transparent 60%)',
  reconnecting:  'conic-gradient(from 0deg, #d97706 0%, #ff7a59 40%, transparent 60%)',
  connected:     'conic-gradient(from 0deg, #ff7a59 0%, #5b8def 50%, #0fa86b 100%)',
  disconnecting: 'conic-gradient(from 0deg, #d97706 0%, #ff7a59 40%, transparent 60%)',
  error:         'conic-gradient(from 0deg, #e23636 0%, #ff7a59 50%, transparent 70%)',
}

const ANIMATED_STATES: VPNConnectionState[] = ['connecting', 'connected', 'reconnecting', 'disconnecting']

interface AuroraOrbProps {
  state: VPNConnectionState
  onToggle: () => void
  size?: number
  className?: string
}

export function AuroraOrb({ state, onToggle, size = 240, className }: AuroraOrbProps) {
  const prefersReducedMotion = useReducedMotion()
  const isAnimated = ANIMATED_STATES.includes(state) && !prefersReducedMotion
  const isClickable = state !== 'connecting' && state !== 'disconnecting' && state !== 'reconnecting'

  const { from, to, glow } = STATE_GRADIENT[state]
  const label = STATE_LABELS[state]

  const handleClick = useCallback(() => {
    if (isClickable) onToggle()
  }, [isClickable, onToggle])

  const ringSize = size * 1.08
  const haloSize = size * 1.42

  return (
    <div
      className={cn('relative flex flex-col items-center gap-5', className)}
      style={{ width: size }}
    >
      {/* Blur halo */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: haloSize,
          height: haloSize,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) translateY(-20px)',
          borderRadius: '50%',
          background: glow,
          filter: 'blur(40px)',
          opacity: state === 'disconnected' ? 0.3 : 0.6,
          transition: 'background 600ms ease, opacity 600ms ease',
        }}
      />

      {/* Rotating conic ring */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: ringSize,
          height: ringSize,
          top: '50%',
          left: '50%',
          x: '-50%',
          y: '-50%',
          translateY: -20,
          borderRadius: '50%',
          background: RING_GRADIENT[state],
          mask: `radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 3px))`,
        }}
        animate={isAnimated ? { rotate: 360 } : { rotate: 0 }}
        transition={isAnimated
          ? { duration: 8, repeat: Infinity, ease: 'linear' }
          : { duration: 0.6, ease: 'easeOut' }
        }
      />

      {/* Main orb button */}
      <motion.button
        onClick={handleClick}
        disabled={!isClickable}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-full border-0 overflow-hidden',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30',
          isClickable ? 'cursor-pointer' : 'cursor-not-allowed',
          'no-drag'
        )}
        style={{ width: size, height: size }}
        animate={isAnimated && !prefersReducedMotion ? {
          scale: [1, 1.04, 1],
          opacity: [0.85, 1, 0.85],
        } : { scale: 1, opacity: 1 }}
        transition={isAnimated && !prefersReducedMotion ? {
          duration: 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
        } : { duration: 0.4 }}
        whileHover={isClickable && !prefersReducedMotion ? { scale: 1.03 } : {}}
        whileTap={isClickable && !prefersReducedMotion ? { scale: 0.97 } : {}}
        aria-label={label}
      >
        {/* Gradient disc */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 38% 35%, ${from} 0%, ${to} 60%, ${to}80 100%)`,
            transition: 'background 600ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />

        {/* Sweep highlight — connected only */}
        <AnimatePresence>
          {state === 'connected' && !prefersReducedMotion && (
            <motion.div
              key="sweep"
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
              }}
              animate={{ x: ['-120%', '220%'] }}
              transition={{
                duration: 2.6,
                repeat: Infinity,
                repeatDelay: 1.2,
                ease: 'easeInOut',
              }}
            />
          )}
        </AnimatePresence>

        {/* Icon + label */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={state}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <Shield
                className="text-white drop-shadow-sm"
                style={{ width: size * 0.133, height: size * 0.133 }}
                strokeWidth={2}
              />
              <span
                className="text-white font-semibold text-center leading-tight drop-shadow-sm select-none"
                style={{ fontSize: size * 0.058 }}
              >
                {label}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.button>
    </div>
  )
}
