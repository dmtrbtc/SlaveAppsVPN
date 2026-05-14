import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, User, CreditCard, Monitor, Bell, Shield, Code2, Smartphone } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Spinner } from '../components/ui/spinner'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { cn } from '../lib/utils'
import { ipc } from '../lib/ipc'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore } from '../stores/ui.store'
import type { AppSettings } from '@shared/ipc/types'
import type { Subscription } from '@slave-vpn/shared'

const SUB_STATUS_CONFIG = {
  active: { label: 'Активна', variant: 'connected' as const },
  expired: { label: 'Истекла', variant: 'default' as const },
  limited: { label: 'Ограничена', variant: 'connecting' as const },
  paused: { label: 'Приостановлена', variant: 'default' as const },
  none: { label: 'Нет подписки', variant: 'default' as const },
}

export function SettingsPage() {
  const { user, logout } = useAuthStore()
  const { notify } = useUIStore()
  const [loggingOut, setLoggingOut] = useState(false)
  const [savingKey, setSavingKey] = useState<keyof AppSettings | null>(null)

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<AppSettings> => {
      const result = await ipc.settings.get()
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    staleTime: 60_000,
  })

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async (): Promise<Subscription> => {
      const result = await ipc.subscription.get()
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    staleTime: 120_000,
    retry: 1,
  })

  const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({})
  useEffect(() => {
    if (settings) setLocalSettings(settings)
  }, [settings])

  const handleToggle = async (key: keyof AppSettings, value: boolean) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
    setSavingKey(key)
    try {
      const result = await ipc.settings.set({ [key]: value })
      if (!result.ok) throw new Error(result.error.message)
    } catch (err) {
      setLocalSettings(prev => ({ ...prev, [key]: !value }))
      notify({ type: 'error', title: 'Ошибка сохранения', message: String(err) })
    } finally {
      setSavingKey(null)
    }
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
  const trafficPct = subscription ? Math.min(100, (trafficUsedGb / subscription.trafficLimitGb) * 100) : 0

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
            <div className="flex items-center justify-center h-16"><Spinner /></div>
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
            <div className="flex items-center justify-center h-16"><Spinner /></div>
          ) : (
            <Card className="flex flex-col divide-y divide-border/40 p-0">
              <ToggleRow
                label="Автозапуск"
                description="Запускать приложение при входе в систему"
                value={localSettings.autoStart ?? false}
                onChange={v => void handleToggle('autoStart', v)}
                loading={savingKey === 'autoStart'}
              />
              <ToggleRow
                label="Свернуть в трей"
                description="При закрытии окна приложение остаётся в фоне"
                value={localSettings.minimizeToTray ?? true}
                onChange={v => void handleToggle('minimizeToTray', v)}
                loading={savingKey === 'minimizeToTray'}
              />
              <ToggleRow
                label="Автоподключение"
                description="Подключаться при запуске приложения"
                value={localSettings.autoConnect ?? false}
                onChange={v => void handleToggle('autoConnect', v)}
                loading={savingKey === 'autoConnect'}
              />
            </Card>
          )}
        </Section>

        {/* Security */}
        <Section label="Безопасность" icon={<Shield className="h-3.5 w-3.5" />}>
          <Card className="flex flex-col divide-y divide-border/40 p-0">
            <ToggleRow
              label="Kill Switch"
              description="Блокировать весь трафик при разрыве VPN"
              value={localSettings.killSwitch ?? false}
              onChange={v => void handleToggle('killSwitch', v)}
              loading={savingKey === 'killSwitch'}
            />
          </Card>
        </Section>

        {/* Notifications */}
        <Section label="Уведомления" icon={<Bell className="h-3.5 w-3.5" />}>
          <Card className="flex flex-col divide-y divide-border/40 p-0">
            <ToggleRow
              label="Уведомления"
              description="Показывать системные уведомления"
              value={localSettings.notificationsEnabled ?? true}
              onChange={v => void handleToggle('notificationsEnabled', v)}
              loading={savingKey === 'notificationsEnabled'}
            />
          </Card>
        </Section>

        {/* Dev */}
        {localSettings.devMode && (
          <Section label="Разработка" icon={<Code2 className="h-3.5 w-3.5" />}>
            <Card className="flex flex-col gap-1">
              {localSettings.apiBaseUrl && (
                <div>
                  <p className="text-[10px] text-text-muted mb-0.5">API Base URL</p>
                  <code className="text-[11px] text-text-secondary break-all">{localSettings.apiBaseUrl}</code>
                </div>
              )}
            </Card>
          </Section>
        )}

        {/* Logout */}
        <Separator />
        <Button
          variant="destructive"
          size="default"
          className="w-full"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
        >
          {loggingOut ? <Spinner size="sm" /> : <LogOut className="h-4 w-4" />}
          Выйти из аккаунта
        </Button>

        <p className="text-center text-[10px] text-text-muted pb-2">
          SLAVE VPN · Engine-neutral platform
        </p>
      </div>
    </div>
  )
}

function Section({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted uppercase tracking-wider mb-2 px-1">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  loading,
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  loading?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-[11px] text-text-muted">{description}</p>
      </div>
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <button
          onClick={() => onChange(!value)}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0',
            value ? 'bg-accent' : 'bg-bg-secondary border border-border'
          )}
        >
          <span className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200',
            value ? 'left-[calc(100%-1.125rem)]' : 'left-0.5'
          )} />
        </button>
      )}
    </div>
  )
}
