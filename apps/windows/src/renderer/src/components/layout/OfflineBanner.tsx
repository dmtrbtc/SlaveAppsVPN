import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return isOnline
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute bottom-3 left-3 right-3 z-40 flex items-center gap-2.5 rounded-xl border border-error/25 bg-error/10 px-3.5 py-2.5 shadow-card pointer-events-none"
        >
          <WifiOff className="h-3.5 w-3.5 text-error shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-error">Нет подключения к интернету</p>
            <p className="text-[10px] text-text-muted">VPN недоступен без сети</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
