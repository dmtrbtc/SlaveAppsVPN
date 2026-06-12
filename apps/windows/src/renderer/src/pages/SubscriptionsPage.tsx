import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight, X, Link as LinkIcon,
  KeyRound, ScanLine, AlertCircle, Loader2, Edit3, Check,
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ListSkeleton, EmptyState } from '../components/ui/states'
import { CabinetPanel } from '../components/cabinet/CabinetPanel'
import { cn } from '../lib/utils'
import { useSubscriptionsStore } from '../stores/subscriptions.store'
import { useUIStore } from '../stores/ui.store'
import type {
  SubscriptionEntry,
  SubscriptionAutoUpdate,
  ConfigSourceType,
} from '@shared/ipc/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTO_UPDATE_OPTIONS: { value: SubscriptionAutoUpdate; label: string }[] = [
  { value: 0, label: 'Выкл' },
  { value: 15, label: '15 мин' },
  { value: 60, label: '1 час' },
  { value: 360, label: '6 часов' },
  { value: 1440, label: '24 часа' },
]

const TYPE_LABELS: Record<ConfigSourceType, string> = {
  'subscription-url': 'URL',
  'single-proxy': 'Нода',
  'remnawave-key': 'Remnawave',
  'provider': 'Провайдер',
}

const TYPE_TONES: Record<ConfigSourceType, 'accent' | 'ok' | 'warn' | 'neutral'> = {
  'subscription-url': 'accent',
  'single-proxy': 'ok',
  'remnawave-key': 'warn',
  'provider': 'neutral',
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'никогда'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} д назад`
}

// ─── Entry row ────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: SubscriptionEntry }) {
  const { update, remove, refresh, pending } = useSubscriptionsStore()
  const { notify } = useUIStore()
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(entry.name)

  const isPending = pending.has(entry.id)

  const handleToggle = () => {
    void update(entry.id, { enabled: !entry.enabled })
  }

  const handleAutoUpdate = (value: SubscriptionAutoUpdate) => {
    void update(entry.id, { autoUpdateMinutes: value })
  }

  const handleRename = async () => {
    if (!nameDraft.trim() || nameDraft === entry.name) {
      setRenaming(false)
      setNameDraft(entry.name)
      return
    }
    try {
      await update(entry.id, { name: nameDraft.trim() })
      setRenaming(false)
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleRefresh = async () => {
    try {
      await refresh(entry.id)
      notify({ type: 'success', title: 'Обновлено', message: entry.name })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка обновления', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleRemove = async () => {
    if (!confirm(`Удалить подписку "${entry.name}"?`)) return
    try {
      await remove(entry.id)
      notify({ type: 'success', title: 'Удалено', message: entry.name })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className={cn(
      'flex flex-col gap-2.5 rounded-lg border border-border bg-bg-primary p-3.5 transition-colors',
      !entry.enabled && 'opacity-60',
    )}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className="shrink-0 text-text-muted hover:text-accent transition-colors mt-0.5"
        >
          {entry.enabled
            ? <ToggleRight className="h-5 w-5 text-accent" />
            : <ToggleLeft className="h-5 w-5" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Name + rename */}
          <div className="flex items-center gap-1.5">
            {renaming ? (
              <>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleRename()
                    if (e.key === 'Escape') { setRenaming(false); setNameDraft(entry.name) }
                  }}
                  autoFocus
                  className="bg-bg-secondary border border-border rounded px-2 py-0.5 text-[13px] text-text-primary flex-1"
                />
                <button onClick={() => void handleRename()} className="text-accent">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-[13px] font-semibold text-text-primary truncate">{entry.name}</span>
                <button
                  onClick={() => { setRenaming(true); setNameDraft(entry.name) }}
                  className="text-text-muted hover:text-text-secondary shrink-0"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              </>
            )}
            <Badge tone={TYPE_TONES[entry.type]} className="text-[9px] shrink-0">
              {TYPE_LABELS[entry.type]}
            </Badge>
          </div>

          {/* Meta line */}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted flex-wrap">
            {entry.urlDomain && <span className="font-mono">{entry.urlDomain}</span>}
            {entry.nodeCount !== null && (
              <span className="font-mono">{entry.nodeCount} нод</span>
            )}
            <span>обновлено {timeAgo(entry.lastFetchedAt)}</span>
          </div>

          {/* Last error */}
          {entry.lastError && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-error">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-words">{entry.lastError}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void handleRefresh()}
            disabled={isPending}
            className="p-1.5 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-secondary disabled:opacity-50 transition-colors"
            title="Обновить сейчас"
          >
            {isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => void handleRemove()}
            disabled={isPending}
            className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/5 disabled:opacity-50 transition-colors"
            title="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Auto-update picker */}
      <div className="flex items-center gap-2 pl-8">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">Автообновление</span>
        <div className="flex flex-wrap gap-1">
          {AUTO_UPDATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAutoUpdate(opt.value)}
              disabled={isPending}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] transition-colors',
                entry.autoUpdateMinutes === opt.value
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-bg-secondary text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Add modal ────────────────────────────────────────────────────────────────

type AddTab = 'url' | 'single-proxy' | 'remnawave'

function AddSubscriptionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<AddTab>('url')
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { add } = useSubscriptionsStore()
  const { notify } = useUIStore()

  useEffect(() => {
    if (!open) {
      setInput(''); setName(''); setError(null); setSubmitting(false); setTab('url')
    }
  }, [open])

  const placeholderByTab: Record<AddTab, string> = {
    url: 'https://example.com/subscription/abc123',
    'single-proxy': 'vless://uuid@server:443?...',
    remnawave: 'Ваш access key',
  }

  const typeByTab: Record<AddTab, ConfigSourceType> = {
    url: 'subscription-url',
    'single-proxy': 'single-proxy',
    remnawave: 'remnawave-key',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const entry = await add({
        type: typeByTab[tab],
        input: input.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      notify({ type: 'success', title: 'Подписка добавлена', message: entry.name })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-bg-primary shadow-card"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-[14px] font-semibold text-text-primary">Добавить подписку</span>
              <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-2">
              {([
                { id: 'url' as const, label: 'URL', Icon: LinkIcon },
                { id: 'single-proxy' as const, label: 'Нода', Icon: ScanLine },
                { id: 'remnawave' as const, label: 'Remnawave key', Icon: KeyRound },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors',
                    tab === t.id
                      ? 'border-accent text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary',
                  )}
                >
                  <t.Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-3 p-5">
              <Input
                placeholder={placeholderByTab[tab]}
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <Input
                placeholder="Название (необязательно)"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
              />
              {error && (
                <div className="flex items-start gap-1.5 text-[11px] text-error">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <Button type="submit" variant="primary" size="sm" disabled={!input.trim() || submitting} className="flex-1">
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {submitting ? 'Проверяем...' : 'Добавить'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
                  Отмена
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SubscriptionsPage() {
  const { entries, loading, refreshAll, pending } = useSubscriptionsStore()
  const [addOpen, setAddOpen] = useState(false)

  const refreshingAll = pending.has('__refreshAll__')

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.addedAt - a.addedAt),
    [entries],
  )

  const totalNodes = useMemo(
    () => entries.reduce((sum, e) => sum + (e.nodeCount ?? 0), 0),
    [entries],
  )

  const handleRefreshAll = () => {
    void refreshAll()
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Подписки</h2>
            <p className="text-[12px] text-text-muted mt-0.5">
              {entries.length > 0
                ? `${entries.length} источника · ${totalNodes} нод суммарно`
                : 'Источники нод для подключения'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefreshAll}
              disabled={refreshingAll || entries.length === 0}
              title="Обновить все"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshingAll && 'animate-spin')} />
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-6 py-5">
        {/* Personal cabinet — sign in here; the cabinet subscription imports
            automatically after login. */}
        <CabinetPanel />

        {loading && entries.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ScanLine className="h-11 w-11" />}
            label="Подписок пока нет"
            description="Добавьте URL-подписку, ноду VLESS/VMess или ключ Remnawave, чтобы начать."
            action={
              <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} className="mt-1">
                <Plus className="h-3.5 w-3.5" />
                Добавить подписку
              </Button>
            }
          />
        ) : (
          <>
            {sorted.map(entry => <EntryRow key={entry.id} entry={entry} />)}
            <p className="mt-1 px-1 text-[11px] text-text-muted">
              Включённые подписки объединяются и дедуплицируются; приоритет нод — по порядку в списке.
            </p>
          </>
        )}
      </div>

      <AddSubscriptionModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
