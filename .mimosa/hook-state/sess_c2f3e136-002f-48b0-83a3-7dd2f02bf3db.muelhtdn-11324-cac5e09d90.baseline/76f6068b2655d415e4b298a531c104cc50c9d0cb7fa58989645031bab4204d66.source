import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { cn } from '../../lib/utils'

const ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
}

const COLORS = {
  info: 'border-accent/30 bg-accent/10 text-text-accent',
  success: 'border-connected/30 bg-connected/10 text-connected',
  warning: 'border-connecting/30 bg-connecting/10 text-connecting',
  error: 'border-error/30 bg-error/10 text-error',
}

export function NotificationStack() {
  const { notifications, dismissNotification } = useUIStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="sync">
        {notifications.map(n => {
          const Icon = ICONS[n.type]
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-card text-sm max-w-72',
                COLORS[n.type]
              )}
            >
              <Icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{n.title}</p>
                {n.message && (
                  <p className="text-xs opacity-80 mt-0.5">{n.message}</p>
                )}
              </div>
              <button
                onClick={() => dismissNotification(n.id)}
                className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
