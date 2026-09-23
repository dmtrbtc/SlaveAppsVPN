import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark, ChevronDown, Plus, Trash2, Check, X } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { profilesApi, events as ipcEvents } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import { useVpnStore } from '../../stores/vpn.store'
import type { AppProfile } from '@shared/ipc/types'

interface State {
  profiles: AppProfile[]
  activeProfileId: string | null
}

export function ProfileSwitcher({ className }: { className?: string }) {
  const { notify } = useUIStore()
  const status = useVpnStore(s => s.status)
  const isConnected = status.state === 'connected'

  const [state, setState] = useState<State>({ profiles: [], activeProfileId: null })
  const [open, setOpen] = useState(false)
  const [savingName, setSavingName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [busy, setBusy] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)

  // Initial load + subscribe
  useEffect(() => {
    profilesApi.list().then(setState).catch(() => undefined)
    const unsub = ipcEvents.onProfilesChanged(setState)
    return () => unsub()
  }, [])

  // Click-outside close
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowSave(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  const active = state.profiles.find(p => p.id === state.activeProfileId) ?? null

  const handleApply = async (profile: AppProfile): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await profilesApi.apply({ id: profile.id, hotReload: isConnected })
      notify({
        type: 'success',
        title: 'Профиль применён',
        message: profile.name + (isConnected ? ' (hot reload)' : ''),
      })
      setOpen(false)
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    const name = savingName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const profile = await profilesApi.saveCurrent({ name })
      notify({ type: 'success', title: 'Сохранено', message: profile.name })
      setSavingName('')
      setShowSave(false)
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (id: string, name: string): Promise<void> => {
    if (!confirm(`Удалить профиль "${name}"?`)) return
    try {
      await profilesApi.remove(id)
      notify({ type: 'success', title: 'Удалён', message: name })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
          'border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
        )}
        title="Быстрое переключение профилей"
      >
        <Bookmark className="h-3 w-3" />
        <span className="truncate max-w-[140px]">
          {active ? active.name : 'Профиль'}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-[280px] rounded-lg border border-border bg-bg-primary shadow-card overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-primary uppercase tracking-wide">
                Профили
              </span>
              <button
                onClick={() => setShowSave(v => !v)}
                className="text-[10px] text-accent hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Сохранить текущий
              </button>
            </div>

            {/* Save form */}
            <AnimatePresence>
              {showSave && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="border-b border-border overflow-hidden bg-accent/5"
                >
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Название профиля"
                      value={savingName}
                      onChange={e => setSavingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleSave()
                        if (e.key === 'Escape') { setShowSave(false); setSavingName('') }
                      }}
                      autoFocus
                      className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40"
                    />
                    <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={!savingName.trim() || busy}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => { setShowSave(false); setSavingName('') }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* List */}
            <div className="max-h-[280px] overflow-y-auto">
              {state.profiles.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-text-muted">
                  Нет сохранённых профилей.
                  <br />
                  Настройте подписку, scenarios, DNS — затем сохраните как профиль.
                </div>
              ) : (
                state.profiles.map(profile => {
                  const isActive = state.activeProfileId === profile.id
                  const snapshot = profile.snapshot
                  return (
                    <div
                      key={profile.id}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-b-0 cursor-pointer transition-colors',
                        isActive
                          ? 'bg-accent/10 hover:bg-accent/15'
                          : 'hover:bg-bg-secondary/60',
                      )}
                      onClick={() => void handleApply(profile)}
                    >
                      {isActive && <Check className="h-3 w-3 text-accent shrink-0" />}
                      <div className={cn('flex-1 min-w-0', !isActive && 'ml-5')}>
                        <p className="text-[12px] font-medium text-text-primary truncate">
                          {profile.name}
                        </p>
                        <p className="text-[10px] text-text-muted font-mono truncate">
                          {[
                            snapshot.selectedEngine,
                            snapshot.dnsPreset,
                            snapshot.enabledScenarios?.length && `${snapshot.enabledScenarios.length} scn`,
                          ].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          void handleRemove(profile.id, profile.name)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
