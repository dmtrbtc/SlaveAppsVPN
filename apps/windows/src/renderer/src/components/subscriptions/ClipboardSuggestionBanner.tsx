import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clipboard, X, Plus, Loader2 } from 'lucide-react'
import { useClipboardSuggestion } from '../../hooks/useClipboardSuggestion'
import { useSubscriptionsStore } from '../../stores/subscriptions.store'
import { useUIStore } from '../../stores/ui.store'

export function ClipboardSuggestionBanner() {
  const { suggestion, dismiss } = useClipboardSuggestion()
  const add = useSubscriptionsStore(s => s.add)
  const { notify } = useUIStore()
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!suggestion.input || adding) return
    setAdding(true)
    try {
      const entry = await add({
        type: 'single-proxy',
        input: suggestion.input,
        ...(suggestion.preview?.name ? { name: suggestion.preview.name } : {}),
      })
      notify({ type: 'success', title: 'Подписка добавлена', message: entry.name })
      dismiss()
    } catch (err) {
      notify({ type: 'error', title: 'Не удалось добавить', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setAdding(false)
    }
  }

  return (
    <AnimatePresence>
      {suggestion.isVisible && suggestion.input && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-[min(480px,calc(100%-32px))]"
        >
          <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-bg-primary/95 backdrop-blur-md shadow-card px-4 py-3">
            <Clipboard className="h-4 w-4 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-text-primary">
                Найдена ссылка {suggestion.scheme?.toUpperCase()}
              </p>
              <p className="text-[11px] text-text-muted truncate font-mono">
                {suggestion.preview?.name ?? suggestion.input.slice(0, 60)}
                {suggestion.preview?.security && suggestion.preview.security !== 'none' &&
                  ` · ${suggestion.preview.security}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Добавить
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={adding}
              className="shrink-0 text-text-muted hover:text-text-secondary transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
