import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Check, SplitSquareVertical, Landmark } from 'lucide-react'
import { Segmented } from '../ui/segmented'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'
import { settingsApi, splitApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import { IS_MOBILE } from '../../lib/platform'
import { cn } from '../../lib/utils'
import type { SplitAppInfo } from '@shared/ipc/types'

type Mode = 'off' | 'include' | 'exclude'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'off',     label: 'Все' },
  { value: 'include', label: 'Только выбр.' },
  { value: 'exclude', label: 'Кроме выбр.' },
]

const MODE_HINT: Record<Mode, string> = {
  off:     'Весь трафик идёт через VPN.',
  include: 'Через VPN пойдут ТОЛЬКО выбранные приложения.',
  exclude: 'Выбранные приложения идут МИМО VPN (прямое подключение). Нужно для банков, которые блокируют вход при включённом VPN. Работает в любом режиме.',
}

// Substring patterns (matched against the installed-app packageName) for Russian
// banking / payment apps that refuse to run with ANY active VPN. One-tap excludes
// them so their sockets bypass the tunnel entirely → no VPN detected, RU exit IP.
const BANK_PACKAGE_PATTERNS: readonly string[] = [
  'sberbank', 'sber.', 'vtb', 'alfabank', 'tinkoff', 'tbank', 'gazprombank',
  'raiffeisen', 'rosbank', 'pochta.bank', 'pochtabank', 'sovcombank', 'psbank',
  'rshb', 'uralsib', 'openbank', 'otkritie', 'mkb', 'ozon', 'yoo.money', 'yoomoney',
  'mironline', 'nspk', 'gosuslugi', 'rostel', 'mir.',
]

function isBankApp(pkg: string): boolean {
  const p = pkg.toLowerCase()
  return BANK_PACKAGE_PATTERNS.some(pat => p.includes(pat))
}

/**
 * Per-app split tunnel for Android (native VpnService addAllowed/Disallowed-
 * Application). Mode + the selected package list persist in AppSettings
 * (splitTunnelMode / splitProcessList) and apply on the next connect.
 */
export function AndroidSplitTunnel() {
  if (!IS_MOBILE) return null
  return <AndroidSplitTunnelInner />
}

function AndroidSplitTunnelInner() {
  const { notify } = useUIStore()
  const [mode, setMode] = useState<Mode>('off')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [apps, setApps] = useState<SplitAppInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [showSystem, setShowSystem] = useState(false)

  useEffect(() => {
    settingsApi.get()
      .then(s => {
        setMode(((s as { splitTunnelMode?: Mode }).splitTunnelMode) ?? 'off')
        setSelected(new Set(s.splitProcessList ?? []))
      })
      .catch(() => undefined)
  }, [])

  // Load the installed-app catalogue (idempotent — returns the cached list).
  const ensureApps = useCallback(async (): Promise<SplitAppInfo[]> => {
    if (apps.length > 0) return apps
    setLoading(true)
    try {
      const list = await splitApi.listApps()
      const sorted = [...list].sort((a, b) => a.label.localeCompare(b.label))
      setApps(sorted)
      return sorted
    } catch {
      notify({ type: 'error', title: 'Не удалось получить список приложений' })
      return []
    } finally {
      setLoading(false)
    }
  }, [apps, notify])

  // Lazily load the catalogue the first time split is enabled.
  useEffect(() => {
    if (mode === 'off' || apps.length > 0 || loading) return
    void ensureApps()
  }, [mode, apps.length, loading, ensureApps])

  const changeMode = (m: Mode) => {
    setMode(m)
    void settingsApi.set({ splitTunnelMode: m } as Parameters<typeof settingsApi.set>[0])
  }

  // One-tap: route every installed banking app MIMO the VPN (exclude mode).
  const excludeBanks = async () => {
    const list = await ensureApps()
    const banks = list.filter(a => isBankApp(a.packageName)).map(a => a.packageName)
    if (banks.length === 0) {
      notify({ type: 'info', title: 'Банковские приложения не найдены', message: 'Не нашли установленных банков по списку' })
      return
    }
    setMode('exclude')
    await settingsApi.set({ splitTunnelMode: 'exclude' } as Parameters<typeof settingsApi.set>[0])
    setSelected(prev => {
      const next = new Set(prev)
      for (const b of banks) next.add(b)
      void splitApi.setProcessList({ processList: [...next] })
      return next
    })
    notify({ type: 'success', title: 'Банки — мимо VPN', message: `Исключено приложений: ${banks.length}. Переподключитесь.` })
  }

  const toggleApp = (pkg: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(pkg)) next.delete(pkg)
      else next.add(pkg)
      void splitApi.setProcessList({ processList: [...next] })
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter(a =>
      (showSystem || !a.system) &&
      (!q || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q)),
    )
  }, [apps, query, showSystem])

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-primary p-4">
      <div className="flex items-center gap-2">
        <SplitSquareVertical className="h-4 w-4 text-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">Приложения и VPN</p>
          <p className="text-[11px] text-text-muted">Какие приложения идут через VPN, а какие — мимо</p>
        </div>
      </div>

      {/* One-tap «банки мимо VPN» — the common case (bank apps block on VPN). */}
      <Button variant="secondary" size="sm" onClick={() => void excludeBanks()} className="justify-start">
        <Landmark className="h-3.5 w-3.5" />
        Банковские приложения — мимо VPN
      </Button>

      <Segmented options={MODE_OPTIONS} value={mode} onChange={changeMode} size="sm" />
      <p className="text-[11px] text-text-muted">{MODE_HINT[mode]}</p>

      {mode !== 'off' && (
        <>
          <Input
            icon={<Search className="h-3.5 w-3.5" />}
            placeholder="Поиск приложения"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-[11px] text-text-muted">
            <input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)} />
            Показывать системные
          </label>

          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {filtered.map(app => {
                const on = selected.has(app.packageName)
                return (
                  <button
                    key={app.packageName}
                    onClick={() => toggleApp(app.packageName)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                      on ? 'border-accent bg-accent/10' : 'border-border bg-bg-primary hover:bg-bg-secondary',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-text-primary">{app.label}</span>
                      <span className="block truncate font-mono text-[10px] text-text-muted">{app.packageName}</span>
                    </span>
                    <span className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on ? 'border-accent bg-accent' : 'border-border-strong',
                    )}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="py-4 text-center text-[11px] text-text-muted">Ничего не найдено</p>
              )}
            </div>
          )}

          <p className="text-[10px] text-text-muted">
            Выбрано: {selected.size}. Применится при следующем подключении.
          </p>
        </>
      )}
    </div>
  )
}
