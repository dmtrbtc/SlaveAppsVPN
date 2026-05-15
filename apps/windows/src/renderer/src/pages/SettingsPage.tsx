import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, User, CreditCard, Monitor, Bell, Shield, Smartphone } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Section } from '../components/ui/section'
import { ToggleRow } from '../components/ui/toggle-row'
import { Separator } from '../components/ui/separator'
import { LoadingState, ErrorState } from '../components/ui/states'
import { cn } from '../lib/utils'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore } from '../stores/ui.store'
import { useSettings, useSettingsMutation } from '../hooks/useSettings'
import { useSubscription } from '../hooks/useSubscription'
import type { AppSettings } from '@shared/ipc/types'
import type { SubscriptionStatus } from '@slave-vpn/shared'

const SUB_STATUS_CONFIG: Record<SubscriptionStatus, { label: string; variant: 'connected' | 'default' | 'connecting' }> = {
  active: { label: 'Активна', variant: 'connected' },
  expired: { label: 'Истекла', variant: 'default' },
  limited: { label: 'Ограничена', variant: 'connecting' },
  paused: { label: 'Приостановлена', variant: 'default' },
  none: { label: 'Нет подписки', variant: 'default' },
}

export function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { notify } = useUIStore()
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
    isPending && pendingVars && key in pendingVars

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-5">
        <h1 className="text-sm font-semibold text-text-primary">Настройки</h1>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-6">
        {/* Account */}
        <Section label="Аккаунт" icon={<User className="h-3.5 w-3.5" />}>
          <Card className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent font-semibold text-sm">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{displayName}</p>
              {user?.email && <p className="text-[11px] text-text-muted">{user.email}</p>}
            </div>
          </Card>
        </Section>

        {/* Subscription */}
        <Section label="Подписка" icon={<CreditCard className="h-3.5 w-3.5" />}>
          {subLoading ? (
            <LoadingState />
          ) : subscription ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{subscription.tariffName}</span>
                <Badge variant={SUB_STATUS_CONFIG[subscription.status].variant}>
                  {SUB_STATUS_CONFIG[subscription.status].label}
                </Badge>
              </div>
              {subscription.expiresAt && (
                <p className="text-[11px] text-text-muted">
                  До {new Date(subscription.expiresAt).toLocaleDateString('ru-RU')}
                </p>
              )}
              <div className="space-y-1">
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
              <div className="flex items-center gap-3 text-[11px] text-text-muted pt-0.5">
                <span className="flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  {subscription.devicesOnline} / {subscription.deviceLimit} устр.
                </span>
              </div>
            </Card>
          ) : (
            <Card className="text-center text-xs text-text-muted py-3">Нет активной подписки</Card>
          )}
        </Section>

        {/* General */}
        <Section label="Основные" icon={<Monitor className="h-3.5 w-3.5" />}>
          {settingsLoading ? (
            <LoadingState />
          ) : settingsError ? (
            <ErrorState error={settingsError} retry={() => void refetchSettings()} />
          ) : settings ? (
            <Card className="flex flex-col divide-y divide-border/40 p-0">
              <ToggleRow
                label="Автозапуск"
                description="Запускать приложение при входе в систему"
                value={settings.autoStart}
                onChange={v => handleToggle('autoStart', v)}
                loading={isKeyPending('autoStart')}
              />
              <ToggleRow
                label="Свернуть в трей"
                description="При закрытии окна приложение остаётся в фоне"
                value={settings.minimizeToTray}
                onChange={v => handleToggle('minimizeToTray', v)}
                loading={isKeyPending('minimizeToTray')}
              />
              <ToggleRow
                label="Автоподключение"
                description="Подключаться при запуске приложения"
                value={settings.autoConnect}
                onChange={v => handleToggle('autoConnect', v)}
                loading={isKeyPending('autoConnect')}
              />
            </Card>
          ) : null}
        </Section>

        {/* Security */}
        <Section label="Безопасность" icon={<Shield className="h-3.5 w-3.5" />}>
          {settings ? (
            <Card className="flex flex-col divide-y divide-border/40 p-0">
              <ToggleRow
                label="Kill Switch"
                description="Блокировать весь трафик при разрыве VPN"
                value={settings.killSwitch}
                onChange={v => handleToggle('killSwitch', v)}
                loading={isKeyPending('killSwitch')}
              />
            </Card>
          ) : null}
        </Section>

        {/* Notifications */}
        <Section label="Уведомления" icon={<Bell className="h-3.5 w-3.5" />}>
          {settings ? (
            <Card className="flex flex-col divide-y divide-border/40 p-0">
              <ToggleRow
                label="Уведомления"
                description="Показывать системные уведомления"
                value={settings.notificationsEnabled}
                onChange={v => handleToggle('notificationsEnabled', v)}
                loading={isKeyPending('notificationsEnabled')}
              />
            </Card>
          ) : null}
        </Section>

        {/* Logout */}
        <Separator />
        <Button
          variant="destructive"
          size="default"
          className="w-full"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Выход...' : 'Выйти из аккаунта'}
        </Button>

        <p className="text-center text-[10px] text-text-muted pb-2">
          SLAVE VPN · Engine-neutral platform
        </p>
      </div>
    </div>
  )
}
