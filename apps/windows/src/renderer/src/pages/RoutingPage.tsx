import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Shield, SplitSquareVertical, Settings2, Check,
  Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, AlertCircle, X,
  Map, ShieldOff, Play, Sparkles, Gamepad2, Cpu, type LucideIcon,
} from 'lucide-react'
import { ProcessPickerModal } from '../components/split/ProcessPickerModal'
import { splitApi } from '../lib/api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { useVpnStore } from '../stores/vpn.store'
import { useUIStore } from '../stores/ui.store'
import { rulesApi, routingApi } from '../lib/api'
import type { VPNMode } from '@slave-vpn/shared'
import type { RuleProvider, RuleProviderAddPayload, RoutingScenarioInfo } from '@shared/ipc/types'

// ─── Mode picker ──────────────────────────────────────────────────────────────

interface ModeOption {
  mode: VPNMode
  Icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  recommended?: boolean
}

const MODES: ModeOption[] = [
  {
    mode: 'bypass',
    Icon: Shield,
    label: 'Обход блокировок',
    description: 'Трафик к заблокированным сервисам через VPN, остальное — напрямую.',
    recommended: true,
  },
  {
    mode: 'full',
    Icon: Globe,
    label: 'Полный VPN',
    description: 'Весь трафик через VPN. Максимальная анонимность.',
  },
  {
    mode: 'split',
    Icon: SplitSquareVertical,
    label: 'Раздельный туннель',
    description: 'Только выбранные приложения идут через VPN.',
  },
  {
    mode: 'custom',
    Icon: Settings2,
    label: 'Кастомный',
    description: 'Импорт правил, кастомные провайдеры, ручной приоритет.',
  },
]

// ─── Routing scenarios section (Karing-style recipes) ────────────────────────

const SCENARIO_ICON_MAP: Record<string, LucideIcon> = {
  Map,
  Globe,
  ShieldOff,
  Play,
  Sparkles,
  Gamepad2,
}

const CATEGORY_BADGE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'> = {
  bypass: 'accent',
  block: 'bad',
  streaming: 'ok',
  ai: 'accent',
  gaming: 'ok',
  work: 'neutral',
  privacy: 'warn',
  custom: 'neutral',
}

function resolveScenarioIcon(name: string): LucideIcon {
  return SCENARIO_ICON_MAP[name] ?? Shield
}

function ScenarioCard({
  scenario,
  disabled,
  onToggle,
}: {
  scenario: RoutingScenarioInfo
  disabled: boolean
  onToggle: () => void
}) {
  const Icon = resolveScenarioIcon(scenario.icon)
  const enabled = scenario.enabled

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'group relative rounded-lg border p-3.5 text-left transition-all duration-200',
        'hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
        enabled
          ? 'border-accent/45 bg-accent/8'
          : 'border-border bg-bg-primary hover:border-border-strong hover:shadow-card',
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          enabled ? 'bg-accent/15 text-accent' : 'bg-bg-secondary text-text-muted',
        )}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={CATEGORY_BADGE_TONE[scenario.category] ?? 'neutral'} className="text-[9px] capitalize">
            {scenario.category}
          </Badge>
          {enabled ? (
            <ToggleRight className="h-5 w-5 text-accent" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-text-muted" />
          )}
        </div>
      </div>
      <p className={cn(
        'text-[13px] font-semibold mb-0.5',
        enabled ? 'text-text-primary' : 'text-text-secondary',
      )}>
        {scenario.name}
      </p>
      <p className="text-[11px] text-text-muted leading-relaxed mb-2">
        {scenario.description}
      </p>
      <div className="flex items-center justify-between text-[10px] text-text-muted">
        <span className="font-mono">{scenario.ruleCount} правил</span>
        {!scenario.composable && (
          <span className="font-medium uppercase tracking-wide opacity-70">эксклюзивный</span>
        )}
      </div>
    </button>
  )
}

function ScenariosSection() {
  const { notify } = useUIStore()
  const [scenarios, setScenarios] = useState<RoutingScenarioInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await routingApi.listScenarios()
      setScenarios(list)
    } catch {
      // Non-fatal — UI just won't render scenarios
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleToggle = async (scenario: RoutingScenarioInfo) => {
    if (pending) return
    setPending(scenario.id)

    const willEnable = !scenario.enabled
    let nextIds = scenarios.filter(s => s.enabled).map(s => s.id)

    if (willEnable) {
      nextIds.push(scenario.id)
      // Enforce mutual exclusivity for non-composable scenarios
      if (!scenario.composable) {
        const otherNonComposable = scenarios.filter(s => !s.composable && s.id !== scenario.id)
        nextIds = nextIds.filter(id => !otherNonComposable.some(o => o.id === id))
      }
    } else {
      nextIds = nextIds.filter(id => id !== scenario.id)
    }

    try {
      const updated = await routingApi.setEnabledScenarios(nextIds)
      setScenarios(updated)
      notify({
        type: 'success',
        title: willEnable ? 'Сценарий включён' : 'Сценарий выключен',
        message: scenario.name,
      })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: err instanceof Error ? err.message : String(err) })
    } finally {
      setPending(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.2 }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Сценарии маршрутизации</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Готовые рецепты — комбинируйте для нужного результата
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-bg-primary py-8 flex items-center justify-center text-[12px] text-text-muted">
          Загрузка сценариев...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {scenarios.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              disabled={pending !== null && pending !== scenario.id}
              onToggle={() => void handleToggle(scenario)}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Rule provider row ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  'russia-bypass': '🇷🇺 Россия',
  streaming: '🎬 Стриминг',
  ai: '🤖 AI',
  gaming: '🎮 Игры',
  privacy: '🔒 Приватность',
  work: '💼 Работа',
  custom: '⚙️ Кастом',
}

function ProviderRow({
  provider,
  onToggle,
  onRemove,
}: {
  provider: RuleProvider
  onToggle: () => void
  onRemove: () => void
}) {
  const catLabel = provider.category ? CATEGORY_LABELS[provider.category] : null

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors',
      !provider.enabled && 'opacity-50'
    )}>
      {/* Toggle */}
      <button onClick={onToggle} className="shrink-0 text-text-muted hover:text-accent transition-colors">
        {provider.enabled
          ? <ToggleRight className="h-5 w-5 text-accent" />
          : <ToggleLeft className="h-5 w-5" />
        }
      </button>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-medium text-text-primary truncate">{provider.name}</span>
          {provider.isPreset && <Badge tone="neutral" className="text-[9px]">Встроен</Badge>}
          {catLabel && <Badge tone="neutral" className="text-[9px]">{catLabel}</Badge>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-muted font-mono truncate">
            {provider.url.replace(/^https?:\/\//, '').slice(0, 50)}
          </span>
          {provider.ruleCount !== undefined && (
            <span className="text-[10px] text-text-muted shrink-0">{provider.ruleCount} правил</span>
          )}
          {provider.lastError && (
            <span title={provider.lastError} className="shrink-0">
              <AlertCircle className="h-3 w-3 text-error" />
            </span>
          )}
        </div>
      </div>

      {/* Action — action badge + delete */}
      <Badge tone={provider.action === 'proxy' ? 'ok' : provider.action === 'reject' ? 'bad' : 'neutral'}
        className="shrink-0 text-[9px]">
        {provider.action === 'proxy' ? 'VPN' : provider.action === 'reject' ? 'Блок' : 'Прямо'}
      </Badge>

      {!provider.isPreset && (
        <button
          onClick={onRemove}
          className="shrink-0 text-text-muted hover:text-error transition-colors ml-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Add provider form ────────────────────────────────────────────────────────

function AddProviderForm({ onAdd, onCancel }: {
  onAdd: (payload: RuleProviderAddPayload) => Promise<void>
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await onAdd({
        name: name.trim() || new URL(url).hostname,
        url: url.trim(),
        type: 'domain-list',
        action: 'proxy',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={e => void handleSubmit(e)}
      className="border border-accent/25 rounded-lg bg-accent/3 p-4 flex flex-col gap-3 overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-primary">Добавить источник правил</span>
        <button type="button" onClick={onCancel} className="text-text-muted hover:text-text-secondary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Input
        placeholder="https://github.com/.../rules.txt"
        value={url}
        onChange={e => setUrl(e.target.value)}
        disabled={submitting}
      />
      <Input
        placeholder="Название (необязательно)"
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={submitting}
      />
      {error && (
        <p className="text-[11px] text-error">{error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!url.trim() || submitting} className="flex-1">
          {submitting ? 'Добавление...' : 'Добавить'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </motion.form>
  )
}

// ─── Rule providers section ───────────────────────────────────────────────────

function RuleProvidersSection() {
  const { notify } = useUIStore()
  const [providers, setProviders] = useState<RuleProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const loadProviders = useCallback(async () => {
    try {
      const list = await rulesApi.list()
      setProviders(list)
    } catch {
      // Non-fatal
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadProviders() }, [loadProviders])

  const handleToggle = async (provider: RuleProvider) => {
    try {
      await rulesApi.update({ id: provider.id, enabled: !provider.enabled })
      setProviders(prev => prev.map(p => p.id === provider.id ? { ...p, enabled: !p.enabled } : p))
    } catch {
      notify({ type: 'error', title: 'Ошибка', message: 'Не удалось изменить провайдер' })
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await rulesApi.remove({ id })
      setProviders(prev => prev.filter(p => p.id !== id))
      notify({ type: 'success', title: 'Удалено', message: 'Источник правил удалён' })
    } catch {
      notify({ type: 'error', title: 'Ошибка', message: 'Не удалось удалить провайдер' })
    }
  }

  const handleAdd = async (payload: RuleProviderAddPayload) => {
    const added = await rulesApi.add(payload)
    setProviders(prev => [...prev, added])
    setShowAdd(false)
    notify({ type: 'success', title: 'Добавлен', message: added.name })
  }

  const handleReload = async () => {
    setReloading(true)
    try {
      await rulesApi.reload()
      await loadProviders()
      notify({ type: 'success', title: 'Правила обновлены', message: `${providers.length} источников` })
    } catch {
      notify({ type: 'error', title: 'Ошибка обновления', message: 'Не удалось обновить правила' })
    } finally {
      setReloading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.2 }}
      className="flex flex-col gap-3"
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Источники правил</p>
          <p className="text-[11px] text-text-muted mt-0.5">Списки доменов и IP для маршрутизации</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleReload()}
            disabled={reloading}
            title="Обновить правила"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', reloading && 'animate-spin')} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAdd(v => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <AddProviderForm
            onAdd={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      {/* Providers list */}
      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[12px] text-text-muted">
            Загрузка...
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-text-muted">
            <Shield className="h-5 w-5 opacity-40" />
            <span className="text-[12px]">Нет источников правил</span>
          </div>
        ) : (
          providers.map(provider => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onToggle={() => void handleToggle(provider)}
              onRemove={() => void handleRemove(provider.id)}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PRIORITY_BANDS = [
  { range: '0–999',    label: 'Процессы',    tone: 'accent'  as const },
  { range: '1000–1999', label: 'Пользователь', tone: 'ok'     as const },
  { range: '2000–2999', label: 'Провайдер',    tone: 'warn'   as const },
  { range: '3000–3999', label: 'GeoIP/GeoSite', tone: 'neutral' as const },
]

function SplitTunnelSection() {
  const [showPicker, setShowPicker] = useState(false)
  const [processList, setProcessList] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    splitApi.getProcessList().then(list => {
      if (alive) setProcessList(list)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [showPicker])  // reload when picker closes

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.2 }}
      className="rounded-lg border border-border bg-bg-primary p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Приложения через VPN</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {processList.length === 0
              ? 'Список пуст — весь трафик пойдёт напрямую'
              : `${processList.length} приложен${processList.length === 1 ? 'ие' : 'ий'} в VPN`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
          <Cpu className="h-3.5 w-3.5" />
          Выбрать
        </Button>
      </div>
      {processList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {processList.slice(0, 12).map(name => (
            <Badge key={name} tone="accent" className="text-[10px] font-mono">{name}</Badge>
          ))}
          {processList.length > 12 && (
            <Badge tone="neutral" className="text-[10px]">+{processList.length - 12}</Badge>
          )}
        </div>
      )}
      <ProcessPickerModal open={showPicker} onClose={() => setShowPicker(false)} />
    </motion.div>
  )
}

export function RoutingPage() {
  const { status, setMode } = useVpnStore()
  const { notify } = useUIStore()
  const [isChanging, setIsChanging] = useState(false)

  const handleModeChange = async (mode: VPNMode) => {
    if (mode === status.mode || isChanging) return
    setIsChanging(true)
    try {
      await setMode(mode)
      notify({ type: 'success', title: 'Режим изменён', message: MODES.find(m => m.mode === mode)?.label ?? mode })
    } catch (err) {
      notify({ type: 'error', title: 'Ошибка', message: String(err) })
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">Маршрутизация</h2>
        <p className="text-[12px] text-text-muted mt-0.5">Режим трафика и источники правил</p>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Mode grid 2×2 */}
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((option, i) => {
            const isSelected = status.mode === option.mode
            return (
              <motion.div
                key={option.mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
              >
                <div
                  onClick={() => void handleModeChange(option.mode)}
                  className={cn(
                    'rounded-lg border p-[18px] cursor-pointer transition-all duration-200',
                    'hover:-translate-y-px',
                    isSelected
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-primary hover:border-border-strong hover:shadow-card',
                    isChanging && 'pointer-events-none opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      isSelected ? 'bg-accent/15' : 'bg-bg-secondary'
                    )}>
                      <option.Icon className={cn(
                        'h-4.5 w-4.5',
                        isSelected ? 'text-accent' : 'text-text-muted'
                      )} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {option.recommended && (
                        <Badge tone="ok">Рекомендовано</Badge>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                  </div>
                  <p className={cn(
                    'text-[13px] font-semibold mb-1',
                    isSelected ? 'text-text-primary' : 'text-text-secondary'
                  )}>
                    {option.label}
                  </p>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Routing scenarios (Karing-style recipes) */}
        <ScenariosSection />

        {/* Split tunnel: visible whenever mode is 'split' */}
        {status.mode === 'split' && <SplitTunnelSection />}

        {/* Priority bands */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.2 }}
          className="rounded-lg border border-border bg-bg-primary p-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-3">
            Приоритеты правил
          </p>
          <div className="flex flex-col gap-2">
            {PRIORITY_BANDS.map(band => (
              <div key={band.range} className="flex items-center gap-3">
                <Badge tone={band.tone} className="font-mono text-[10px] min-w-[76px] justify-center">
                  {band.range}
                </Badge>
                <span className="text-[12px] text-text-secondary">{band.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Rule providers */}
        <RuleProvidersSection />
      </div>
    </div>
  )
}
