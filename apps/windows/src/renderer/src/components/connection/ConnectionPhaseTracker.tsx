import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Circle } from 'lucide-react'
import type { VPNConnectionState } from '@slave-vpn/shared'
import { cn } from '../../lib/utils'

interface Phase {
  id: string
  label: string
  detail: string
  durationMs: number
}

const PHASES: Phase[] = [
  { id: 'engine',  label: 'Инициализация движка',  detail: 'Mihomo runtime',       durationMs: 900  },
  { id: 'routing', label: 'Применение маршрутов',  detail: 'Bypass • 60+ правил',  durationMs: 850  },
  { id: 'dns',     label: 'Активация DNS',          detail: 'DoH • Fake-IP режим',  durationMs: 650  },
  { id: 'tunnel',  label: 'Установка туннеля',      detail: 'Protocol handshake',   durationMs: 1700 },
  { id: 'verify',  label: 'Проверка связи',         detail: 'Connectivity test',    durationMs: 750  },
]

type PhaseStatus = 'pending' | 'active' | 'done' | 'error'

function useConnectionPhases(connectionState: VPNConnectionState): PhaseStatus[] {
  const sessionRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [phases, setPhases] = useState<PhaseStatus[]>(PHASES.map(() => 'pending'))

  useEffect(() => {
    const isTransitioning = connectionState === 'connecting' || connectionState === 'reconnecting'
    const isDone = connectionState === 'connected'
    const isError = connectionState === 'error'
    const isIdle = connectionState === 'disconnected' || connectionState === 'disconnecting'

    if (isDone) {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      setPhases(PHASES.map(() => 'done'))
      return
    }

    if (isError) {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      setPhases(prev => prev.map(s => (s === 'active' ? 'error' : s)))
      return
    }

    if (isIdle) {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      setPhases(PHASES.map(() => 'pending'))
      sessionRef.current++
      return
    }

    if (isTransitioning) {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      const session = ++sessionRef.current

      setPhases(PHASES.map((_, i) => (i === 0 ? 'active' : 'pending')))

      let elapsed = 0
      PHASES.forEach((phase, i) => {
        const t = setTimeout(() => {
          if (sessionRef.current !== session) return
          setPhases(prev =>
            prev.map((s, j) => {
              if (j === i) return 'done'
              if (j === i + 1) return 'active'
              return s
            })
          )
        }, elapsed + phase.durationMs)
        timersRef.current.push(t)
        elapsed += phase.durationMs
      })

      return () => {
        timersRef.current.forEach(clearTimeout)
        timersRef.current = []
      }
    }
  }, [connectionState])

  useEffect(() => () => { timersRef.current.forEach(clearTimeout) }, [])

  return phases
}

interface ConnectionPhaseTrackerProps {
  connectionState: VPNConnectionState
}

export function ConnectionPhaseTracker({ connectionState }: ConnectionPhaseTrackerProps) {
  const phases = useConnectionPhases(connectionState)
  const isReconnecting = connectionState === 'reconnecting'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="w-full max-w-sm"
    >
      <div className="rounded-2xl border border-border/60 bg-bg-primary/80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40">
          <div className="flex gap-0.5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-1 w-1 rounded-full bg-text-muted animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
            {isReconnecting ? 'reconnecting' : 'establishing connection'}
          </span>
        </div>

        {/* Phases */}
        <div className="px-4 py-3 flex flex-col gap-2.5">
          {PHASES.map((phase, i) => {
            const status = phases[i] ?? 'pending'
            return (
              <PhaseRow
                key={phase.id}
                phase={phase}
                status={status}
                index={i}
              />
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

function PhaseRow({ phase, status, index }: {
  phase: Phase
  status: PhaseStatus
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: status === 'pending' ? 0.35 : 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="flex items-center gap-3"
    >
      {/* Status icon */}
      <div className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300',
        status === 'done' && 'bg-connected/20',
        status === 'active' && 'bg-connecting/20',
        status === 'error' && 'bg-error/20',
        status === 'pending' && 'bg-bg-secondary',
      )}>
        <AnimatePresence mode="wait">
          {status === 'done' && (
            <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <Check className="h-3 w-3 text-connected" />
            </motion.div>
          )}
          {status === 'active' && (
            <motion.div key="active" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <div className="h-2 w-2 rounded-full bg-connecting animate-pulse" />
            </motion.div>
          )}
          {status === 'error' && (
            <motion.div key="error" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-3 w-3 text-error" />
            </motion.div>
          )}
          {status === 'pending' && (
            <motion.div key="pending" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <Circle className="h-2 w-2 text-text-muted opacity-50" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-xs font-medium transition-colors duration-300',
          status === 'done' && 'text-text-secondary',
          status === 'active' && 'text-text-primary',
          status === 'error' && 'text-error',
          status === 'pending' && 'text-text-muted',
        )}>
          {phase.label}
        </span>
      </div>

      {/* Detail */}
      <span className={cn(
        'text-[10px] font-mono shrink-0 transition-colors duration-300',
        status === 'done' ? 'text-text-muted' : 'text-text-muted opacity-0',
        status === 'active' && 'text-connecting opacity-100',
        status === 'error' && 'text-error opacity-100',
      )}>
        {(status === 'active' || status === 'error') && phase.detail}
      </span>
    </motion.div>
  )
}
