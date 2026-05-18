import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, User, CreditCard, Monitor, Bell, Shield, Smartphone, Sun, RefreshCw, Download, RotateCcw } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Section } from '../components/ui/section'
import { ToggleRow } from '../components/ui/toggle-row'
import { Segmented } from '../components/ui/segmented'
import { Separator } from '../components/ui/separator'
import { LoadingState, ErrorState } from '../components/ui/states'
import { cn } from '../lib/utils'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore, type ThemeMode } from '../stores/ui.store'
import { useSettings, useSettingsMutation } from '../hooks/useSettings'
import { useSubscription } from '../hooks/useSubscription'
import {
  useUpdateStatus, useUpdateCheck, useUpdateDownload, useUpdateInstall,
  useUpdateChannel, useUpdateProgress, useUpdateEvents,
} from '../hooks/useUpdate'
import type { AppSettings, UpdateChannel } from '@shared/ipc/types'
import type { SubscriptionStatus } from '@slave-vpn/shared'

const SUB_STATUS_CONFIG: Record<SubscriptionStatus, { label: string; tone: 'ok' | 'neutral' | 'warn' }> = {
  active:  { label: 'Активна',       tone: 'ok'      },
  expired: { label: 'Истекла',       tone: 'neutral'  },
  limited: { label: 'Ограничена',    tone: 'warn'    },
  paused:  { label: 'Приостановлена', tone: 'neutral' },
  none:    { label: 'Нет подписки',  tone: 'neutral'  },
}

function CardRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-bg-primary overflow-hidden', className)}>
      {children}
    </div>
  )
}

const UPDATE_STATE_LABEL: Record<string, string> = {
  idle:          'Актуальная версия',
  checking:      'Проверяется...',
  available:     'Доступно обновление',
  'not-available': 'Актуальная версия',
  downloading:   'Загружается...',
  ready:         'Готово к установке',
  error:         'Ошибка обновления',
}

const UPDATE_STATE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  idle:          'neutral',
  checking:      'neutral',
  available:     'warn',
  'not-available': 'ok',
  downloading:   'neutral',
  ready:         'ok',
  error:         'bad',
}

function UpdateSection() {
  const { data: status, isLoading } = useUpdateStatus()
  const { mutate: check, isPending: isChecking } = useUpdateCheck()
  const { mutate: download, isPending: isDownloading } = useUpdateDownload()
  const { mutate: install } = useUpdateInstall()
  const { mutate: setChannel } = useUpdateChannel()
  const progress = useUpdateProgress()
  useUpdateEvents()

  if (isLoading || !status) return <LoadingState />

  const state = status.state
  const tone = UPDATE_STATE_TONE[state] ?? 'neutral'
  const label = UPDATE_STATE_LABEL[state] ?? state

  return (
    <CardRow>
      <div className="p-4 flex flex-col gap-3">
        {/* Version row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-text-primary">
              v{status.currentVersion}
            </p>
            {status.availableVersion && status.availableVersion !== status.currentVersion && (
              <p className="text-[11px] text-text-muted mt-0.5">
                Доступна v{status.availableVersion}
              </p>
            )}
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>

        {/* Download progress */}
        {(state === 'downloading' || (state === 'ready' && status.downloadProgress > 0)) && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-connected transition-all duration-300"
                style={{ width: `${state === 'ready' ? 100 : progress || status.downloadProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted text-right">
              {state === 'ready' ? '100' : (progress || status.downloadProgress)}%
            </p>
          </div>
        )}

        {/* Error message */}
        {state === 'error' && status.error && (
          <p className="text-[11px] text-error break-all">{status.error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {(state === 'idle' || state === 'not-available' || state === 'error') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => check()}
              loading={isChecking}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Проверить
            </Button>
          )}
          {state === 'available' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => download()}
              loading={isDownloading}
            >
              <Download className="h-3.5 w-3.5" />
              Загрузить
            </Button>
          )}
          {state === 'ready' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => install()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Перезапустить и установить
            </Button>
          )}
        </div>

        {/* Channel selector */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <p className="text-[11px] text-text-muted">Канал обновлений</p>
          <Segmented<UpdateChannel>
            options={[
              { value: 'stable', label: 'Stable' },
              { value: 'beta',   label: 'Beta' },
            ]}
            value={status.channel}
            onChange={ch => setChannel(ch)}
            size="sm"
          />
        </div>
      </div>
    </CardRow>
  )
}

export function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { notify, themeMode, setThemeMode } = useUIStore()
  const [loggingOut, setLoggingOut] = useState(false)

  const { data: settings, isLoading: settingsLoading, error: settingsError, refetch: refetchSettings } = useSettings()
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const { mutate: updateSetting, isPending, variables: pendingVars } = useSettingsMutation()

  const handleToggle = (key: keyof AppSettings, value: boolean) => {
    updateSetting({ [key]: value }, {
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

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : user?.username ?? user?.email ?? 'Пользователь'

  const trafficUsedGb = subscription ? subscription.trafficUsedBytes / (1024 ** 3) : 0
  const trafficPct = subscription
    ? Math.min(100, (trafficUsedGb / subscription.trafficLimitGb) * 100)
    : 0

  const isKeyPending = (key: keyof AppSettings) =>
    isPending && pendingVars != null && key in pendingVars

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">Настройки</h2>
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">
        {/* Account */}
        <Section label="Аккаунт" icon={<User className="h-3.5 w-3.5" />}>
          <CardRow>
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
          </CardRow>
        </Section>

        {/* Subscription */}
        <Section label="Подписка" icon={<CreditCard className="h-3.5 w-3.5" />}>
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
                {/* Traffic bar */}
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
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Smartphone className="h-3 w-3" />
                  <span>{subscription.devicesOnline} / {subscription.deviceLimit} устройств</span>
                </div>
              </div>
            </CardRow>
          ) : (
            <CardRow>
              <p className="text-center text-[13px] text-text-muted p-4">Нет активной подписки</p>
            </CardRow>
          )}
        </Section>

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
              {loggingOut ? 'Выход...' : 'Выйти из аккаунта'}
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-text-muted pb-2">
          SLAVE VPN · Engine-neutral platform
        </p>
      </div>
    </div>
  )
}
