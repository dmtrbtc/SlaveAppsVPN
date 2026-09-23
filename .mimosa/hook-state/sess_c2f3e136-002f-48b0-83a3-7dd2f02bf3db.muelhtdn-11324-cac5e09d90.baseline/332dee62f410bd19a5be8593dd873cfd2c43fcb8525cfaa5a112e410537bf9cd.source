import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Loader2, Cpu, Check, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { splitApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import type { RunningProcess } from '@shared/ipc/types'

interface Props {
  open: boolean
  onClose: () => void
}

function uniqByName(list: RunningProcess[]): RunningProcess[] {
  const seen = new Set<string>()
  const out: RunningProcess[] = []
  for (const p of list) {
    const key = p.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export function ProcessPickerModal({ open, onClose }: Props) {
  const { notify } = useUIStore()
  const [processes, setProcesses] = useState<RunningProcess[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Load running processes + current saved list when the modal opens
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    Promise.all([splitApi.getProcesses(), splitApi.getProcessList()])
      .then(([procs, saved]) => {
        if (!alive) return
        setProcesses(uniqByName(procs))
        setSelected(new Set(saved))
      })
      .catch(err => {
        if (!alive) return
        notify({ type: 'error', title: 'Ошибка загрузки', message: err instanceof Error ? err.message : String(err) })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [open, notify])

  const toggle = (name: string): void => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await splitApi.setProcessList({ processList: [...selected] })
      notify({ type: 'success', title: 'Сохранено', message: `${selected.size} процесс(а)` })
      onClose()
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка сохранения', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleClearAll = (): void => {
    setSelected(new Set())
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return processes
    return processes.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false))
  }, [processes, search])

  // Selected items that are NOT in the running list — show separately
  // so user can keep persistent rules for apps that aren't running right now.
  const orphanSelected = useMemo(() => {
    const inList = new Set(processes.map(p => p.name.toLowerCase()))
    return [...selected].filter(name => !inList.has(name.toLowerCase()))
  }, [processes, selected])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm p-6"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-border bg-bg-primary shadow-card flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
              <div>
                <span className="text-[14px] font-semibold text-text-primary">Раздельный туннель</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Выберите приложения, чей трафик пойдёт через VPN
                </p>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search + tools */}
            <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Поиск процесса..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-bg-secondary border border-border rounded-md pl-8 pr-3 py-1.5 text-[12px] text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-accent/40"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearAll} disabled={selected.size === 0}>
                <Trash2 className="h-3 w-3" />
                Очистить
              </Button>
            </div>

            {/* Selected counter */}
            <div className="px-5 py-2 border-b border-border bg-bg-secondary/40 shrink-0">
              <span className="text-[11px] text-text-muted">
                Выбрано: <span className="text-text-primary font-mono">{selected.size}</span>
                {' • Доступно: '}
                <span className="text-text-primary font-mono">{filtered.length}</span>
              </span>
            </div>

            {/* Process list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-[12px] text-text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  Сканирование процессов...
                </div>
              ) : filtered.length === 0 && orphanSelected.length === 0 ? (
                <div className="text-center py-12 text-[12px] text-text-muted">
                  {search ? 'Ничего не найдено' : 'Нет запущенных процессов'}
                </div>
              ) : (
                <>
                  {filtered.map(proc => {
                    const isSelected = selected.has(proc.name)
                    return (
                      <button
                        key={`${proc.name}-${proc.pid}`}
                        type="button"
                        onClick={() => toggle(proc.name)}
                        className={cn(
                          'w-full flex items-center gap-3 px-5 py-2 text-left border-b border-border/40 last:border-b-0 transition-colors',
                          'hover:bg-bg-secondary/60',
                          isSelected && 'bg-accent/8',
                        )}
                      >
                        <div className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                          isSelected
                            ? 'border-accent bg-accent text-bg-base'
                            : 'border-border bg-bg-primary',
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <Cpu className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-text-primary truncate block">
                            {proc.name}
                          </span>
                          {proc.description && proc.description !== proc.name.replace('.exe', '') && (
                            <span className="text-[10px] text-text-muted truncate block">
                              {proc.description}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted font-mono shrink-0">
                          PID {proc.pid}
                        </span>
                      </button>
                    )
                  })}
                  {orphanSelected.length > 0 && (
                    <div className="border-t border-border bg-bg-secondary/30 px-5 py-2">
                      <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1.5">
                        Не запущены, но сохранены
                      </p>
                      {orphanSelected.map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggle(name)}
                          className="w-full flex items-center gap-3 py-1 text-left opacity-60 hover:opacity-100 transition-opacity"
                        >
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-accent bg-accent text-bg-base">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                          <Cpu className="h-3 w-3 shrink-0 text-text-muted" />
                          <span className="text-[11px] font-medium text-text-secondary truncate flex-1">
                            {name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-3 flex gap-2 shrink-0">
              <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Сохранение...' : `Сохранить (${selected.size})`}
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
