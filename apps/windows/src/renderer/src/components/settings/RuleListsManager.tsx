import { useState } from 'react'
import { Plus, Trash2, RefreshCw, ListChecks, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { IS_MOBILE } from '../../lib/platform'
import { Button } from '../ui/button'
import { useUIStore } from '../../stores/ui.store'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'
import {
  getRuleLists, addRuleList, removeRuleList, updateRuleList,
  type RuleListEntry,
} from '../../android/runtime-settings'

const INTERVALS = [
  { h: 6, label: '6 ч' },
  { h: 12, label: '12 ч' },
  { h: 24, label: '24 ч' },
  { h: 72, label: '3 дня' },
]

/**
 * Full management of the rule-provider lists (Android): see source / interval /
 * on-off for each, add your own URL lists, delete custom ones. Changes are
 * persisted immediately and take effect on the next connect (offered inline).
 * Android-only — desktop uses the main-process RuleProviderService UI.
 */
export function RuleListsManager() {
  const { notify } = useUIStore()
  const state = useVpnStore(selectConnectionState)
  const connect = useVpnStore(s => s.connect)
  const disconnect = useVpnStore(s => s.disconnect)

  const [lists, setLists] = useState<RuleListEntry[]>(getRuleLists)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [dirty, setDirty] = useState(false)

  if (!IS_MOBILE) return null

  const markDirty = (next: RuleListEntry[]) => { setLists(next); setDirty(true) }

  const handleToggle = (id: string, enabled: boolean) => markDirty(updateRuleList(id, { enabled }))
  const handleInterval = (id: string, intervalHours: number) => markDirty(updateRuleList(id, { intervalHours }))
  const handleRemove = (id: string) => markDirty(removeRuleList(id))

  const handleAdd = () => {
    try {
      const next = addRuleList({ name: newName, url: newUrl })
      markDirty(next)
      setNewName(''); setNewUrl(''); setAdding(false)
      notify({ type: 'success', title: 'Список добавлен', message: newName || newUrl })
    } catch (e) {
      notify({ type: 'error', title: 'Не добавлено', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const applyNow = async () => {
    if (state !== 'connected') { setDirty(false); return }
    setReconnecting(true)
    try {
      await disconnect()
      await new Promise(r => setTimeout(r, 400))
      await connect()
      setDirty(false)
      notify({ type: 'success', title: 'Применено', message: 'Списки правил обновлены' })
    } catch (e) {
      notify({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-text-muted" />
        <p className="text-[13px] font-semibold text-text-primary">Списки правил маршрутизации</p>
      </div>
      <p className="text-[11px] text-text-muted -mt-1">
        Домены из этих списков идут через VPN. Можно включать/выключать, менять интервал обновления и добавлять свои.
      </p>

      <div className="flex flex-col gap-2">
        {lists.map(l => (
          <div key={l.id} className="rounded-md border border-border bg-bg-secondary p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggle(l.id, !l.enabled)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors shrink-0',
                  l.enabled ? 'bg-accent' : 'bg-border-strong',
                )}
                aria-label="toggle"
              >
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', l.enabled ? 'left-[18px]' : 'left-0.5')} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text-primary truncate">{l.name}</p>
                <p className="text-[10px] text-text-muted font-mono truncate">{l.url}</p>
              </div>
              {!l.builtin && (
                <button onClick={() => handleRemove(l.id)} className="p-1 text-text-muted hover:text-error shrink-0" aria-label="delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 pl-11">
              <span className="text-[10px] text-text-muted mr-1">Обновлять:</span>
              {INTERVALS.map(iv => (
                <button
                  key={iv.h}
                  onClick={() => handleInterval(l.id, iv.h)}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
                    l.intervalHours === iv.h ? 'bg-accent/15 text-accent border-accent/25' : 'text-text-muted border-transparent hover:text-text-secondary',
                  )}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-2.5 flex flex-col gap-2">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Название (необязательно)"
            className="w-full rounded-md bg-bg-base border border-border px-2 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted"
          />
          <input
            value={newUrl} onChange={e => setNewUrl(e.target.value)}
            placeholder="https://… (список доменов, по одному в строке)"
            className="w-full rounded-md bg-bg-base border border-border px-2 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted font-mono"
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" className="flex-1" onClick={handleAdd} disabled={!newUrl.trim()}>Добавить</Button>
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setNewName(''); setNewUrl('') }}>Отмена</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Добавить свой список
        </Button>
      )}

      {dirty && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-connecting/10 border border-connecting/30 px-3 py-2">
          <span className="text-[11px] text-connecting">
            {state === 'connected' ? 'Изменения применятся после переподключения' : 'Сохранено · применится при подключении'}
          </span>
          {state === 'connected' && (
            <Button variant="secondary" size="sm" onClick={() => void applyNow()} disabled={reconnecting}>
              {reconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Применить
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
