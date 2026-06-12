import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  User, Mail, Send, LogOut, RefreshCw, Download, CreditCard,
  CheckCircle, Clock, HardDrive, Smartphone, ArrowLeft,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Section } from '../components/ui/section'
import { StatTile } from '../components/ui/stat-tile'
import { Spinner } from '../components/ui/spinner'
import { LoadingState } from '../components/ui/states'
import { cabinetApi } from '../lib/api'
import {
  useCabinetAuthState, useCabinetMe, useCabinetSubscription,
  useCabinetInvalidate, useCabinetEmailLogin, useCabinetLogout, useCabinetImportSubscription,
} from '../hooks/useCabinet'
import { useUIStore } from '../stores/ui.store'
import { useAuthStore } from '../stores/auth.store'
import type { CabinetSubscriptionInfo } from '@shared/ipc/types'

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">{children}</div>
}

export function CabinetPage() {
  const { data: authState, isLoading } = useCabinetAuthState()
  const authenticated = authState?.authenticated ?? false
  const navigate = useNavigate()
  const location = useLocation()
  const standalone = location.pathname === '/cabinet-login'
  const hasAccess = useAuthStore(s => s.hasAccess)

  // In the standalone (onboarding) flow, once the user gains access (e.g. after
  // importing the cabinet subscription) move them into the app.
  useEffect(() => {
    if (standalone && hasAccess) navigate('/dashboard', { replace: true })
  }, [standalone, hasAccess, navigate])

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        {standalone && (
          <button onClick={() => navigate('/onboarding')} className="text-text-muted hover:text-text-secondary" aria-label="назад">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-[15px] font-semibold text-text-primary">Личный кабинет</h2>
      </div>
      <div className="flex flex-col gap-5 px-6 py-5 max-w-2xl w-full">
        {isLoading
          ? <LoadingState label="Проверяем сессию…" />
          : authenticated
            ? <CabinetAccount />
            : <CabinetLogin />}
      </div>
    </div>
  )
}

// ─── Login (Telegram deep-link + email) ───────────────────────────────────────

type TgState =
  | { kind: 'idle' }
  | { kind: 'waiting'; link: string }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

function CabinetLogin() {
  const invalidate = useCabinetInvalidate()
  const { notify } = useUIStore()
  const [tg, setTg] = useState<TgState>({ kind: 'idle' })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<number>(0)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }
  useEffect(() => stopPolling, [])

  const startTelegram = async () => {
    setTg({ kind: 'idle' })
    try {
      const dl = await cabinetApi.requestDeepLink()
      deadlineRef.current = Date.now() + dl.expiresIn * 1000
      setTg({ kind: 'waiting', link: dl.tgLink })
      try { window.open(dl.tgLink, '_blank') } catch { /* ignore */ }
      stopPolling()
      pollRef.current = setInterval(() => { void pollOnce(dl.token) }, 2500)
    } catch (e) {
      setTg({ kind: 'error', message: e instanceof Error ? e.message : 'Ошибка' })
    }
  }

  const pollOnce = async (token: string) => {
    if (Date.now() > deadlineRef.current) { stopPolling(); setTg({ kind: 'expired' }); return }
    try {
      const r = await cabinetApi.pollDeepLink(token)
      if (r.status === 'confirmed') {
        stopPolling()
        invalidate()
        notify({ type: 'success', title: 'Готово', message: 'Вход через Telegram выполнен' })
      } else if (r.status === 'expired') {
        stopPolling(); setTg({ kind: 'expired' })
      }
    } catch { /* keep polling until deadline */ }
  }

  return (
    <>
      <Section label="Вход через Telegram" icon={<Send className="h-3.5 w-3.5" />}>
        <Card>
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[12px] text-text-muted">
              Откройте бота <span className="text-text-secondary font-medium">@Slavevpnbot</span> и
              подтвердите вход — приложение само подхватит сессию.
            </p>
            {tg.kind === 'waiting' ? (
              <div className="flex items-center gap-2 text-[12px] text-text-secondary">
                <Spinner className="h-4 w-4" />
                Ожидаем подтверждения в Telegram…
                <button className="text-accent underline" onClick={() => { try { window.open(tg.link, '_blank') } catch { /* */ } }}>
                  открыть ещё раз
                </button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => void startTelegram()} className="self-start">
                <Send className="h-3.5 w-3.5" /> Войти через Telegram
              </Button>
            )}
            {tg.kind === 'expired' && <p className="text-[11px] text-error">Ссылка истекла — попробуйте снова.</p>}
            {tg.kind === 'error' && <p className="text-[11px] text-error">{tg.message}</p>}
          </div>
        </Card>
      </Section>

      <Section label="Вход по email" icon={<Mail className="h-3.5 w-3.5" />}>
        <EmailLogin />
      </Section>
    </>
  )
}

function EmailLogin() {
  const login = useCabinetEmailLogin()
  const { notify } = useUIStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ email: email.trim(), password }, {
      onSuccess: () => notify({ type: 'success', title: 'Вход выполнен', message: email.trim() }),
    })
  }

  const errMsg = login.isError
    ? ((login.error as Error & { code?: string }).code === 'INVALID_CREDENTIALS'
        ? 'Неверный email или пароль'
        : (login.error as Error).message)
    : undefined

  return (
    <Card>
      <form className="p-4 flex flex-col gap-3" onSubmit={submit}>
        <Input
          type="email" label="Email" placeholder="you@example.com"
          icon={<Mail className="h-3.5 w-3.5" />}
          value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
        />
        <Input
          type="password" label="Пароль" placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          {...(errMsg ? { error: errMsg } : {})}
        />
        <Button type="submit" variant="primary" size="sm" loading={login.isPending} className="self-start"
          disabled={!email.trim() || !password}>
          Войти
        </Button>
      </form>
    </Card>
  )
}

// ─── Account (authenticated) ───────────────────────────────────────────────────

function CabinetAccount() {
  const { data: me, isLoading: meLoading } = useCabinetMe(true)
  const { data: sub, isLoading: subLoading, refetch: refetchSub } = useCabinetSubscription(true)
  const logout = useCabinetLogout()
  const importSub = useCabinetImportSubscription()
  const { notify } = useUIStore()

  const doImport = () => {
    importSub.mutate(undefined, {
      onSuccess: async (res) => {
        if (res.imported) {
          await useAuthStore.getState().bootstrap()
          notify({ type: 'success', title: 'Подписка добавлена', message: 'Серверы кабинета подключены' })
        } else {
          notify({ type: 'info', title: 'Нет активной подписки', message: 'В кабинете не найдена ссылка подписки' })
        }
      },
      onError: (e) => notify({ type: 'error', title: 'Не удалось импортировать', message: (e as Error).message }),
    })
  }

  const displayName = me
    ? (me.username || [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email || `ID ${me.id}`)
    : ''

  return (
    <>
      <Section label="Аккаунт" icon={<User className="h-3.5 w-3.5" />}>
        <Card>
          <div className="p-4 flex flex-col gap-2">
            {meLoading ? <LoadingState label="Загрузка…" /> : me ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-text-primary">{displayName}</p>
                  <Badge tone="neutral">{me.authType === 'telegram' ? 'Telegram' : me.authType === 'email' ? 'Email' : me.authType}</Badge>
                </div>
                {me.email && <p className="text-[12px] text-text-muted">{me.email}{me.emailVerified ? '' : ' · не подтверждён'}</p>}
                <p className="text-[12px] text-text-muted">Баланс: <span className="text-text-secondary font-medium">{me.balanceRubles.toFixed(2)} ₽</span></p>
              </>
            ) : <p className="text-[12px] text-error">Не удалось загрузить профиль</p>}
          </div>
        </Card>
      </Section>

      <Section label="Подписка" icon={<CreditCard className="h-3.5 w-3.5" />}>
        <Card>
          <div className="p-4 flex flex-col gap-3">
            {subLoading ? <LoadingState label="Загрузка…" />
              : sub?.hasSubscription && sub.subscription
                ? <SubscriptionView s={sub.subscription} />
                : <p className="text-[12px] text-text-muted">Активная подписка не найдена.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void refetchSub()}>
                <RefreshCw className="h-3.5 w-3.5" /> Обновить
              </Button>
              <Button variant="primary" size="sm" loading={importSub.isPending} onClick={doImport}
                disabled={!sub?.hasSubscription}>
                <Download className="h-3.5 w-3.5" /> Импортировать подписку
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      <Button variant="ghost" size="sm" loading={logout.isPending} className="self-start text-error"
        onClick={() => logout.mutate()}>
        <LogOut className="h-3.5 w-3.5" /> Выйти из кабинета
      </Button>
    </>
  )
}

function SubscriptionView({ s }: { s: CabinetSubscriptionInfo }) {
  const statusTone: 'ok' | 'warn' | 'neutral' = s.isActive ? 'ok' : s.isExpired ? 'warn' : 'neutral'
  const statusLabel = s.isActive ? (s.isTrial ? 'Пробная' : 'Активна') : s.isExpired ? 'Истекла' : s.status
  const pct = Math.min(100, Math.max(0, Math.round(s.trafficUsedPercent)))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Badge tone={statusTone}><CheckCircle className="h-3 w-3 mr-1" />{statusLabel}</Badge>
        {s.tariffName && <span className="text-[12px] text-text-muted">{s.tariffName}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Осталось" value={s.timeLeftDisplay || `${s.daysLeft} дн.`} icon={<Clock className="h-3.5 w-3.5" />} />
        <StatTile label="Трафик" value={`${s.trafficUsedGb.toFixed(1)}${s.trafficLimitGb > 0 ? ` / ${s.trafficLimitGb} ГБ` : ' ГБ'}`} sub={`${pct}%`} icon={<HardDrive className="h-3.5 w-3.5" />} />
        <StatTile label="Устройства" value={String(s.deviceLimit)} icon={<Smartphone className="h-3.5 w-3.5" />} />
      </div>
      {s.trafficLimitGb > 0 && (
        <div className="h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
