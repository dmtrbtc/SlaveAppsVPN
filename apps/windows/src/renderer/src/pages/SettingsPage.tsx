import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  LogOut, User, CreditCard, Monitor, Bell, Shield, Smartphone, Sun,
  RefreshCw, Download, Link, Key, CheckCircle, XCircle,
  Trash2, Edit3, Server, Clock, Cpu, Bot, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Section } from '../components/ui/section'
import { ToggleRow } from '../components/ui/toggle-row'
import { Segmented } from '../components/ui/segmented'
import { Separator } from '../components/ui/separator'
import { LoadingState, ErrorState } from '../components/ui/states'
import { cn } from '../lib/utils'
import { useAuthStore } from '../stores/auth.store'
import { useVpnStore, selectConnectionState } from '../stores/vpn.store'
import { useUIStore, type ThemeMode } from '../stores/ui.store'
import { useSettings, useSettingsMutation } from '../hooks/useSettings'
import { useSubscription } from '../hooks/useSubscription'
import { checkForUpdate, openUpdate, type UpdateInfo } from '../android/update-check'
import { configSourceApi, cacheApi } from '../lib/api'
import type { AppSettings, ConfigSourceValidateResult, SelectedEngine, BalancerMode, UtlsFingerprintName } from '@shared/ipc/types'
import type { SubscriptionStatus } from '@slave-vpn/shared'

const SUB_STATUS_CONFIG: Record<SubscriptionStatus, { label: string; tone: 'ok' | 'neutral' | 'warn' }> = {
  active:  { label: 'Активна',         tone: 'ok'      },
  expired: { label: 'Истекла',         tone: 'neutral'  },
  limited: { label: 'Ограничена',      tone: 'warn'    },
  paused:  { label: 'Приостановлена',  tone: 'neutral' },
  none:    { label: 'Нет подписки',    tone: 'neutral'  },
}

function CardRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-bg-primary overflow-hidden', className)}>
      {children}
    </div>
  )
}

// ─── Subscription URL Config Source Section ────────────────────────────────────

type EditPhase = 'idle' | 'validating' | 'saving' | 'done' | 'error'

function ConfigSourceSection() {
  const { configSourceMeta, setConfigSourceMeta } = useAuthStore()
  const { notify } = useUIStore()
  const vpnState = useVpnStore(selectConnectionState)
  const { disconnect } = useVpnStore()

  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [phase, setPhase] = useState<EditPhase>('idle')
  const [validateResult, setValidateResult] = useState<ConfigSourceValidateResult | null>(null)
  const [phaseError, setPhaseError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const isConnected = vpnState === 'connected' || vpnState === 'connecting' || vpnState === 'reconnecting'

  const handleStartEdit = () => {
    setInputValue(configSourceMeta?.type === 'subscription-url'
      ? (configSourceMeta as { urlDomain?: string }).urlDomain ?? ''
      : '')
    setPhase('idle')
    setValidateResult(null)
    setPhaseError(null)
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setPhase('idle')
    setValidateResult(null)
    setPhaseError(null)
  }

  const handleValidate = async () => {
    const url = inputValue.trim()
    if (!url) return
    setPhase('validating')
    setValidateResult(null)
    setPhaseError(null)
    try {
      const result = await configSourceApi.validate({ type: 'subscription-url', input: url })
      setValidateResult(result)
      setPhase(result.valid ? 'done' : 'error')
      if (!result.valid) setPhaseError(result.error ?? 'Неверный формат')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase('error')
      setPhaseError(msg)
    }
  }

  const handleSave = async () => {
    const url = inputValue.trim()
    if (!url) return
    setPhase('saving')
    setPhaseError(null)
    try {
      const meta = await configSourceApi.set({ type: 'subscription-url', input: url })
      setConfigSourceMeta(meta)
      setEditing(false)
      setPhase('idle')
      setValidateResult(null)
      // If VPN is connected, disconnect so user reconnects with new subscription
      if (isConnected) {
        await disconnect()
        notify({ type: 'info', title: 'Подписка обновлена', message: 'Переподключитесь к VPN' })
      } else {
        notify({ type: 'success', title: 'Подписка сохранена', message: meta.displayName })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase('error')
      setPhaseError(msg)
    }
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      if (isConnected) await disconnect()
      await configSourceApi.clear()
      setConfigSourceMeta(null)
      notify({ type: 'info', title: 'Конфигурация удалена' })
    } catch {
      notify({ type: 'error', title: 'Ошибка удаления' })
    } finally {
      setClearing(false)
    }
  }

  // View mode — config source is set
  if (!editing && configSourceMeta) {
    return (
      <CardRow>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-secondary">
              {configSourceMeta.type === 'subscription-url' && <Link className="h-3.5 w-3.5 text-text-secondary" />}
              {configSourceMeta.type === 'remnawave-key' && <Key className="h-3.5 w-3.5 text-text-secondary" />}
              {configSourceMeta.type === 'single-proxy' && <Server className="h-3.5 w-3.5 text-text-secondary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-text-primary">{configSourceMeta.displayName}</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                {configSourceMeta.type === 'subscription-url' && 'URL подписки'}
                {configSourceMeta.type === 'remnawave-key' && 'Remnawave ключ'}
                {configSourceMeta.type === 'single-proxy' && 'Одиночный прокси'}
                {' · '}
                {new Date(configSourceMeta.addedAt).toLocaleDateString('ru-RU')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleStartEdit}>
              <Edit3 className="h-3.5 w-3.5" />
              Изменить
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleClear()}
              loading={clearing}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Удалить
            </Button>
          </div>
        </div>
      </CardRow>
    )
  }

  // Edit mode
  if (editing) {
    const canValidate = inputValue.trim().length > 0 && phase !== 'validating' && phase !== 'saving'
    const canSave = validateResult?.valid === true && phase !== 'saving'

    return (
      <CardRow>
        <div className="p-4 flex flex-col gap-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            URL подписки
          </label>
          <input
            type="url"
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value)
              if (validateResult) { setValidateResult(null); setPhase('idle') }
            }}
            placeholder="https://example.com/subscription"
            className={cn(
              'w-full rounded-md border px-3 py-2 text-[13px] font-mono bg-bg-base',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent/50',
              'transition-colors',
              phase === 'error' ? 'border-error/50' : 'border-border',
            )}
            disabled={phase === 'validating' || phase === 'saving'}
            onKeyDown={e => { if (e.key === 'Enter' && canValidate) void handleValidate() }}
          />

          {/* Validation result */}
          {validateResult && validateResult.valid && (
            <div className="rounded-md border border-connected/25 bg-connected/5 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-connected shrink-0" />
                <span className="text-[12px] font-medium text-connected">{validateResult.displayName}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {validateResult.nodeCount !== undefined && (
                  <Badge tone="ok">{validateResult.nodeCount} узлов</Badge>
                )}
                {validateResult.protocols && Object.entries(validateResult.protocols).map(([proto, count]) => (
                  <Badge key={proto} variant="protocol">{proto}: {count}</Badge>
                ))}
              </div>
            </div>
          )}

          {phaseError && (
            <div className="flex items-start gap-2 rounded-md border border-error/25 bg-error/5 p-3">
              <XCircle className="h-3.5 w-3.5 text-error shrink-0 mt-0.5" />
              <p className="text-[12px] text-error">{phaseError}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleValidate()}
              loading={phase === 'validating'}
              disabled={!canValidate}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Проверить
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleSave()}
              loading={phase === 'saving'}
              disabled={!canSave}
            >
              Сохранить
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
              Отмена
            </Button>
          </div>
        </div>
      </CardRow>
    )
  }

  // No config source — prompt to add
  return (
    <CardRow>
      <div className="p-4 flex flex-col gap-3">
        <p className="text-[13px] text-text-muted">Конфигурация не настроена</p>
        <Button variant="secondary" size="sm" className="self-start" onClick={handleStartEdit}>
          <Link className="h-3.5 w-3.5" />
          Добавить URL подписки
        </Button>
      </div>
    </CardRow>
  )
}

// ─── Subscription Status ───────────────────────────────────────────────────────

function SubscriptionStatusSection() {
  const { isAuthenticated, configSourceMeta } = useAuthStore()
  const { data: subscription, isLoading: subLoading, refetch: refetchSub, isFetching } = useSubscription()

  const trafficUsedGb = subscription ? subscription.trafficUsedBytes / (1024 ** 3) : 0
  const trafficPct = subscription
    ? Math.min(100, (trafficUsedGb / subscription.trafficLimitGb) * 100)
    : 0

  // Provider subscription (authenticated)
  if (isAuthenticated) {
    return (
      <>
        {subLoading ? (
          <LoadingState />
        ) : subscription ? (
          <CardRow>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-text-primary">{subscription.tariffName}</span>
                <Badge tone={SUB_STATUS_CONFIG[subscription.status].tone}>
                  {SUB_STATUS_CONFIG[subscription.status].label}
                </Badge>
              </div>
              {subscription.expiresAt && (
                <p className="text-[12px] text-text-muted">
                  До {new Date(subscription.expiresAt).toLocaleDateString('ru-RU')}
                </p>
              )}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>Трафик</span>
                  <span>{trafficUsedGb.toFixed(2)} / {subscription.trafficLimitGb} GB</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      trafficPct > 85 ? 'bg-error' : trafficPct > 60 ? 'bg-connecting' : 'bg-connected'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${trafficPct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Smartphone className="h-3 w-3" />
                  <span>{subscription.devicesOnline} / {subscription.deviceLimit} устройств</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refetchSub()}
                  loading={isFetching}
                >
                  <RefreshCw className="h-3 w-3" />
                  Обновить
                </Button>
              </div>
            </div>
          </CardRow>
        ) : (
          <CardRow>
            <p className="text-center text-[13px] text-text-muted p-4">Нет активной подписки</p>
          </CardRow>
        )}
      </>
    )
  }

  // Config source subscription info
  if (configSourceMeta) {
    return (
      <CardRow>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="h-3.5 w-3.5 text-text-muted shrink-0" />
              <span className="text-[13px] font-medium text-text-primary">{configSourceMeta.displayName}</span>
            </div>
            <Badge tone="neutral">URL</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            <span>Обновлено {new Date(configSourceMeta.addedAt).toLocaleString('ru-RU')}</span>
          </div>
        </div>
      </CardRow>
    )
  }

  return (
    <CardRow>
      <p className="text-center text-[13px] text-text-muted p-4">Подписка не настроена</p>
    </CardRow>
  )
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection() {
  const { user, isAuthenticated, configSourceMeta } = useAuthStore()
  const { notify } = useUIStore()

  const [clearingCache, setClearingCache] = useState(false)

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      await cacheApi.clear()
      notify({ type: 'success', title: 'Кэш очищен', message: 'Данные подписки будут загружены заново' })
    } catch {
      notify({ type: 'error', title: 'Ошибка очистки кэша' })
    } finally {
      setClearingCache(false)
    }
  }

  if (!isAuthenticated && !configSourceMeta) return null

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : user?.username ?? user?.email ?? 'Пользователь'

  return (
    <CardRow>
      <div className="flex flex-col divide-y divide-border">
        {isAuthenticated && (
          <div className="flex items-center gap-3 p-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-semibold text-[15px]"
              style={{ background: 'linear-gradient(135deg, #ff7a59 0%, #5b8def 100%)' }}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-text-primary truncate">{displayName}</p>
              {user?.email && <p className="text-[12px] text-text-muted">{user.email}</p>}
            </div>
          </div>
        )}
        {isAuthenticated && (
          <div className="px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClearCache()}
              loading={clearingCache}
              className="text-text-muted hover:text-text-primary"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Очистить кэш подписки
            </Button>
          </div>
        )}
      </div>
    </CardRow>
  )
}

// ─── Update section ───────────────────────────────────────────────────────────

// Update check via GitHub Releases (same mechanism as the dashboard banner) —
// unified across Android & Windows, and free of the electron-updater pitfalls
// (prerelease channels / latest.yml on the wrong tag / version not bumping).
function UpdateSection() {
  const { data: settings } = useSettings()
  const { mutate: updateSetting } = useSettingsMutation()
  const channel: 'stable' | 'beta' = settings?.updateChannel ?? 'stable'

  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkedOnce, setCheckedOnce] = useState(false)

  const runCheck = async (ch: 'stable' | 'beta'): Promise<void> => {
    setChecking(true)
    try { setInfo(await checkForUpdate(ch)) }
    finally { setChecking(false); setCheckedOnce(true) }
  }
  // Re-check whenever the channel changes (a Dev user should immediately see a
  // newer prerelease; switching back to Stable should clear a prerelease-only
  // banner on the next check).
  useEffect(() => { void runCheck(channel) }, [channel])

  const upToDate = checkedOnce && !info
  const tone: 'ok' | 'warn' | 'neutral' = info ? 'warn' : upToDate ? 'ok' : 'neutral'
  const label = checking ? 'Проверяется…' : info ? 'Доступно обновление' : upToDate ? 'Актуальная версия' : '—'

  return (
    <CardRow>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-text-primary">v{__APP_VERSION__}</p>
            <p className="text-[11px] text-text-muted mt-0.5 font-mono">{__APP_COMMIT__}</p>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>

        {/* Channel selector — Stable (final releases only) vs Dev (also
            prereleases: alpha/beta/rc/dev). */}
        <div className="flex flex-col gap-1.5">
          <Segmented<'stable' | 'beta'>
            options={[
              { value: 'stable', label: 'Стабильная' },
              { value: 'beta',   label: 'Dev' },
            ]}
            value={channel}
            onChange={(ch) => updateSetting({ updateChannel: ch })}
            size="sm"
          />
          <p className="text-[11px] text-text-muted">
            {channel === 'beta'
              ? 'Dev-канал: ранние тестовые сборки (alpha/rc), могут быть нестабильны'
              : 'Только стабильные релизы'}
          </p>
        </div>

        {info && (
          <p className="text-[11px] text-text-muted">
            Доступна <span className="text-text-secondary font-medium">{info.version}</span>
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void runCheck(channel)} loading={checking}>
            <RefreshCw className="h-3.5 w-3.5" />
            Проверить
          </Button>
          {info && (
            <Button variant="primary" size="sm" onClick={() => openUpdate(info)}>
              <Download className="h-3.5 w-3.5" />
              Скачать
            </Button>
          )}
        </div>
      </div>
    </CardRow>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { isAuthenticated, configSourceMeta, logout } = useAuthStore()
  const { notify, themeMode, setThemeMode } = useUIStore()
  const [loggingOut, setLoggingOut] = useState(false)

  const navigate = useNavigate()
  const { data: settings, isLoading: settingsLoading, error: settingsError, refetch: refetchSettings } = useSettings()
  const { mutate: updateSetting, isPending, variables: pendingVars } = useSettingsMutation()

  const handleToggle = (key: keyof AppSettings, value: boolean) => {
    updateSetting({ [key]: value }, {
      onError: () => notify({ type: 'error', title: 'Ошибка сохранения', message: 'Настройка не сохранена' }),
    })
  }

  const handleEngineChange = (engine: SelectedEngine) => {
    updateSetting({ selectedEngine: engine }, {
      onSuccess: () => notify({ type: 'info', title: 'Движок изменён', message: `${engine} будет использован при следующем подключении` }),
      onError: () => notify({ type: 'error', title: 'Ошибка сохранения', message: 'Настройка не сохранена' }),
    })
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      notify({ type: 'error', title: 'Ошибка выхода', message: 'Попробуйте ещё раз' })
    } finally {
      setLoggingOut(false)
    }
  }

  const isKeyPending = (key: keyof AppSettings) =>
    isPending && pendingVars != null && key in pendingVars

  const hasAnyAccess = isAuthenticated || configSourceMeta !== null

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">Настройки</h2>
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">

        {/* Personal cabinet lives in the Подписки tab */}
        <Section label="Личный кабинет" icon={<User className="h-3.5 w-3.5" />}>
          <CardRow>
            <button
              onClick={() => navigate('/subscriptions')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-bg-tertiary transition-colors"
            >
              <span className="text-[13px] text-text-primary">Аккаунт и подписка — на вкладке «Подписки»</span>
              <ChevronRight className="h-4 w-4 text-text-muted" />
            </button>
          </CardRow>
        </Section>

        {/* Config source — subscription management */}
        <Section label="Конфигурация подписки" icon={<Link className="h-3.5 w-3.5" />}>
          <ConfigSourceSection />
        </Section>

        {/* Subscription status */}
        {hasAnyAccess && (
          <Section label="Подписка" icon={<CreditCard className="h-3.5 w-3.5" />}>
            <SubscriptionStatusSection />
          </Section>
        )}

        {/* Account info */}
        {hasAnyAccess && (
          <Section label="Аккаунт" icon={<User className="h-3.5 w-3.5" />}>
            <AccountSection />
          </Section>
        )}

        {/* General settings */}
        <Section label="Основные" icon={<Monitor className="h-3.5 w-3.5" />}>
          {settingsLoading ? (
            <LoadingState />
          ) : settingsError ? (
            <ErrorState error={settingsError} retry={() => void refetchSettings()} />
          ) : settings ? (
            <CardRow>
              <div className="divide-y divide-border">
                <ToggleRow
                  label="Автозапуск"
                  sub="Запускать приложение при входе в систему"
                  value={settings.autoStart}
                  onChange={v => handleToggle('autoStart', v)}
                  loading={isKeyPending('autoStart')}
                />
                <ToggleRow
                  label="Свернуть в трей"
                  sub="При закрытии окна приложение остаётся в фоне"
                  value={settings.minimizeToTray}
                  onChange={v => handleToggle('minimizeToTray', v)}
                  loading={isKeyPending('minimizeToTray')}
                />
                <ToggleRow
                  label="Автоподключение"
                  sub="Подключаться при запуске приложения"
                  value={settings.autoConnect}
                  onChange={v => handleToggle('autoConnect', v)}
                  loading={isKeyPending('autoConnect')}
                />
              </div>
            </CardRow>
          ) : null}
        </Section>

        {/* Security */}
        <Section label="Безопасность" icon={<Shield className="h-3.5 w-3.5" />}>
          {settings ? (
            <CardRow>
              <ToggleRow
                label="Kill Switch"
                sub="Блокировать весь трафик при разрыве VPN"
                value={settings.killSwitch}
                onChange={v => handleToggle('killSwitch', v)}
                loading={isKeyPending('killSwitch')}
              />
            </CardRow>
          ) : null}
        </Section>

        {/* uTLS Fingerprint — anti-DPI (ТСПУ behavioural filter) */}
        <Section label="uTLS отпечаток" icon={<Shield className="h-3.5 w-3.5" />}>
          {settings ? (
            <CardRow>
              <div className="p-4 flex flex-col gap-3">
                <select
                  className="w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm"
                  value={(settings as AppSettings & { utlsFingerprint?: UtlsFingerprintName }).utlsFingerprint ?? 'randomized'}
                  onChange={(e) => {
                    const v = e.target.value as UtlsFingerprintName
                    updateSetting({ utlsFingerprint: v } as Partial<AppSettings>, {
                      onSuccess: () => notify({ type: 'info', title: 'Отпечаток обновлён', message: `Применится при следующем подключении: ${v}` }),
                      onError: () => notify({ type: 'error', title: 'Ошибка сохранения', message: 'Настройка не сохранена' }),
                    })
                  }}
                  disabled={isKeyPending('utlsFingerprint')}
                >
                  <option value="randomized">randomized — рекомендуется (рандомизация Client Hello каждое соединение)</option>
                  <option value="random">random</option>
                  <option value="chrome">chrome</option>
                  <option value="firefox">firefox</option>
                  <option value="safari">safari</option>
                  <option value="edge">edge</option>
                  <option value="ios">iOS</option>
                  <option value="android">android</option>
                  <option value="360">360</option>
                  <option value="qq">qq</option>
                </select>
                <p className="text-[11px] text-text-muted">
                  Отпечаток TLS-клиента, под который подделывается uTLS. <b>randomized</b> ротирует Client Hello
                  на каждом хендшейке — баseline против behavioural-DPI ТСПУ (2026). Меняй на конкретный
                  fingerprint только если канал ругается.
                </p>
                {isKeyPending('utlsFingerprint') && (
                  <p className="text-[11px] text-text-muted">Сохранение...</p>
                )}
              </div>
            </CardRow>
          ) : null}
        </Section>

        {/* Engine selection */}
        <Section label="VPN движок" icon={<Cpu className="h-3.5 w-3.5" />}>
          {settings ? (
            <CardRow>
              <div className="p-4 flex flex-col gap-3">
                <Segmented<SelectedEngine>
                  options={[
                    { value: 'mihomo',  label: 'Mihomo' },
                    { value: 'singbox', label: 'Sing-box' },
                    { value: 'xray',    label: 'Xray' },
                  ]}
                  value={settings.selectedEngine ?? 'mihomo'}
                  onChange={handleEngineChange}
                  size="sm"
                />
                <p className="text-[11px] text-text-muted">
                  {(settings.selectedEngine === 'singbox' || settings.selectedEngine === 'xray')
                    ? 'Экспериментальный движок — применится при следующем подключении'
                    : 'Mihomo — стабильный движок для роутинга трафика'}
                </p>
                {isKeyPending('selectedEngine') && (
                  <p className="text-[11px] text-text-muted">Сохранение...</p>
                )}
              </div>
            </CardRow>
          ) : null}
        </Section>

        {/* Balancer */}
        <Section label="Балансировщик" icon={<Bot className="h-3.5 w-3.5" />}>
          {settings ? (
            <CardRow>
              <div className="divide-y divide-border">
                <ToggleRow
                  label="Intelligent Balancer"
                  sub="Автоматически выбирать лучший сервер по задержке и стабильности"
                  value={settings.balancerEnabled}
                  onChange={v => updateSetting({ balancerEnabled: v })}
                  loading={isKeyPending('balancerEnabled')}
                />
                {settings.balancerEnabled && (
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">Стратегия</p>
                      <p className="text-[11px] text-text-muted mt-0.5">Критерий выбора лучшего сервера</p>
                    </div>
                    <Segmented<BalancerMode>
                      options={[
                        { value: 'latency',   label: 'Пинг'        },
                        { value: 'stability', label: 'Стабильность' },
                        { value: 'balanced',  label: 'Баланс'       },
                      ]}
                      value={settings.balancerMode ?? 'balanced'}
                      onChange={mode => updateSetting({ balancerMode: mode })}
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </CardRow>
          ) : null}
        </Section>

        {/* Appearance */}
        <Section label="Внешний вид" icon={<Sun className="h-3.5 w-3.5" />}>
          <CardRow>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div>
                <p className="text-[13px] font-medium text-text-primary">Тема</p>
                <p className="text-[11px] text-text-muted mt-0.5">Системная / Светлая / Тёмная</p>
              </div>
              <Segmented<ThemeMode>
                options={[
                  { value: 'system', label: 'Авто' },
                  { value: 'light',  label: 'Свет' },
                  { value: 'dark',   label: 'Тёмная' },
                ]}
                value={themeMode}
                onChange={setThemeMode}
                size="sm"
              />
            </div>
          </CardRow>
        </Section>

        {/* Notifications */}
        <Section label="Уведомления" icon={<Bell className="h-3.5 w-3.5" />}>
          {settings ? (
            <CardRow>
              <ToggleRow
                label="Уведомления"
                sub="Показывать системные уведомления"
                value={settings.notificationsEnabled}
                onChange={v => handleToggle('notificationsEnabled', v)}
                loading={isKeyPending('notificationsEnabled')}
              />
            </CardRow>
          ) : null}
        </Section>

        {/* Updates */}
        <Section label="Обновления" icon={<Download className="h-3.5 w-3.5" />}>
          <UpdateSection />
        </Section>

        {/* Danger zone */}
        {hasAnyAccess && (
          <div className="pt-1">
            <Separator />
            <div className="pt-4">
              <Button
                variant="danger"
                size="md"
                className="w-full"
                onClick={() => void handleLogout()}
                loading={loggingOut}
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? 'Выход...' : 'Выйти и сбросить конфигурацию'}
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-text-muted pb-2">
          SLAVE VPN · Engine-neutral platform
        </p>
      </div>
    </div>
  )
}
