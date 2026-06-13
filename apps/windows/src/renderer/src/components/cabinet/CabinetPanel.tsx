import { useEffect, useRef, useState } from 'react'
import {
  User, Mail, Send, LogOut, RefreshCw, Clock, HardDrive, Smartphone, CheckCircle, ChevronDown,
  Wallet, CalendarClock, MonitorSmartphone, Trash2, ExternalLink,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { ToggleRow } from '../ui/toggle-row'
import { cabinetApi } from '../../lib/api'
import {
  useCabinetAuthState, useCabinetMe, useCabinetSubscription,
  useCabinetInvalidate, useCabinetEmailLogin, useCabinetLogout,
  useCabinetTransactions, useCabinetDevices, useCabinetRenewalOptions,
} from '../../hooks/useCabinet'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '../../stores/ui.store'
import { useAuthStore } from '../../stores/auth.store'
import { useSubscriptionsStore } from '../../stores/subscriptions.store'
import { cn } from '../../lib/utils'
import type { CabinetSubscriptionInfo } from '@shared/ipc/types'

/**
 * Personal-cabinet panel embedded at the top of the Подписки tab: sign in
 * (Telegram deep-link / email) → the cabinet subscription is imported
 * AUTOMATICALLY right after login (no extra taps) → compact status card.
 */
export function CabinetPanel() {
  const { data: authState, isLoading } = useCabinetAuthState()
  if (isLoading) return null
  return authState?.authenticated ? <CabinetStatusCard /> : <CabinetLoginCard />
}

// ─── Shared: auto-import after a successful login ─────────────────────────────

function useAutoImport() {
  const { notify } = useUIStore()
  const invalidate = useCabinetInvalidate()
  const fetchSubs = useSubscriptionsStore(s => s.fetch)

  return async (): Promise<void> => {
    invalidate()
    try {
      const res = await cabinetApi.importSubscription()
      if (res.imported) {
        await Promise.all([useAuthStore.getState().bootstrap(), fetchSubs()])
        notify({ type: 'success', title: 'Кабинет подключён', message: 'Подписка добавлена автоматически' })
      } else {
        notify({ type: 'info', title: 'Вход выполнен', message: 'Активная подписка в кабинете не найдена' })
      }
    } catch (e) {
      notify({ type: 'error', title: 'Подписка не импортирована', message: e instanceof Error ? e.message : 'Ошибка' })
    }
  }
}

// ─── Login card ────────────────────────────────────────────────────────────────

type TgState =
  | { kind: 'idle' }
  | { kind: 'waiting'; token: string; bot: string; startParam: string; httpLink: string }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

// tg:// opens the installed Telegram app directly — bypasses the RKN-blocked
// t.me web domain. startParam must be the bot's `webauth_<token>` form.
function tgScheme(bot: string, startParam: string): string {
  return `tg://resolve?domain=${encodeURIComponent(bot)}&start=${encodeURIComponent(startParam)}`
}

function openExternal(url: string): void {
  try { window.open(url, '_system') } catch { try { window.open(url, '_blank') } catch { /* ignore */ } }
}

function CabinetLoginCard() {
  const autoImport = useAutoImport()
  const { notify } = useUIStore()
  const [tg, setTg] = useState<TgState>({ kind: 'idle' })
  const [checking, setChecking] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
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
      setTg({ kind: 'waiting', token: dl.token, bot: dl.botUsername, startParam: dl.startParam, httpLink: dl.tgLink })
      openExternal(tgScheme(dl.botUsername, dl.startParam))
      stopPolling()
      pollRef.current = setInterval(() => { void pollOnce(dl.token) }, 2500)
    } catch (e) {
      setTg({ kind: 'error', message: e instanceof Error ? e.message : 'Ошибка' })
    }
  }

  const pollOnce = async (token: string, manual = false): Promise<void> => {
    if (!manual && Date.now() > deadlineRef.current) { stopPolling(); setTg({ kind: 'expired' }); return }
    if (manual) setChecking(true)
    try {
      const r = await cabinetApi.pollDeepLink(token)
      if (r.status === 'confirmed') {
        stopPolling()
        await autoImport()
      } else if (r.status === 'expired') {
        stopPolling(); setTg({ kind: 'expired' })
      } else if (manual) {
        notify({ type: 'info', title: 'Ещё не подтверждено', message: 'Нажмите Start и «✅ Да, войти» в боте' })
      }
    } catch { /* keep polling until deadline */ }
    finally { if (manual) setChecking(false) }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-accent" />
          <p className="text-[13px] font-medium text-text-primary">Личный кабинет</p>
        </div>

        {tg.kind === 'waiting' ? (
          <>
            <div className="flex items-center gap-2 text-[12px] text-text-secondary">
              <Spinner className="h-4 w-4" />
              Подтвердите вход в Telegram: <span className="font-medium">Start</span> → <span className="font-medium">«✅ Да, войти»</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => openExternal(tgScheme(tg.bot, tg.startParam))}>
                <Send className="h-3.5 w-3.5" /> Открыть Telegram
              </Button>
              <Button variant="secondary" size="sm" loading={checking} onClick={() => void pollOnce(tg.token, true)}>
                Я подтвердил
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void startTelegram()}>
                Новая ссылка
              </Button>
            </div>
            <p className="text-[10px] text-text-muted break-all">
              Не открылось?{' '}
              <button className="text-accent underline" onClick={() => openExternal(tg.httpLink)}>ссылка t.me</button>
              {' '}или отправьте боту: <span className="font-mono text-text-secondary select-all">/start {tg.startParam}</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-[12px] text-text-muted">
              Войдите — подписка из кабинета добавится автоматически.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void startTelegram()}>
                <Send className="h-3.5 w-3.5" /> Войти через Telegram
              </Button>
              <button
                className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary"
                onClick={() => setEmailOpen(v => !v)}
              >
                <Mail className="h-3.5 w-3.5" /> по email
                <ChevronDown className={cn('h-3 w-3 transition-transform', emailOpen && 'rotate-180')} />
              </button>
            </div>
            {emailOpen && <EmailLoginForm onSuccess={autoImport} />}
          </>
        )}
        {tg.kind === 'expired' && <p className="text-[11px] text-error">Ссылка истекла — попробуйте снова.</p>}
        {tg.kind === 'error' && <p className="text-[11px] text-error">{tg.message}</p>}
      </div>
    </div>
  )
}

function EmailLoginForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const login = useCabinetEmailLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate({ email: email.trim(), password }, {
      onSuccess: () => { void onSuccess() },
    })
  }

  const errMsg = login.isError
    ? ((login.error as Error & { code?: string }).code === 'INVALID_CREDENTIALS'
        ? 'Неверный email или пароль'
        : (login.error as Error).message)
    : undefined

  return (
    <form className="flex flex-col gap-2 pt-1" onSubmit={submit}>
      <Input
        type="email" placeholder="Email" icon={<Mail className="h-3.5 w-3.5" />}
        value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
      />
      <Input
        type="password" placeholder="Пароль"
        value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
        {...(errMsg ? { error: errMsg } : {})}
      />
      <Button type="submit" variant="secondary" size="sm" loading={login.isPending} className="self-start"
        disabled={!email.trim() || !password}>
        Войти
      </Button>
    </form>
  )
}

// ─── Status card (authenticated) ──────────────────────────────────────────────

type SectionKey = 'balance' | 'renew' | 'devices' | null

function CabinetStatusCard() {
  const { data: me } = useCabinetMe(true)
  const { data: sub, isFetching, refetch } = useCabinetSubscription(true)
  const logout = useCabinetLogout()
  const autoImport = useAutoImport()
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState<SectionKey>(null)

  const displayName = me
    ? (me.username || [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email || `ID ${me.id}`)
    : '…'

  const s = sub?.subscription ?? null
  const toggle = (k: Exclude<SectionKey, null>) => setOpen(prev => (prev === k ? null : k))

  return (
    <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-accent shrink-0" />
            <p className="text-[13px] font-medium text-text-primary truncate">{displayName}</p>
            {me && <Badge tone="neutral">{me.balanceRubles.toFixed(0)} ₽</Badge>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon-sm" title="Обновить статус" onClick={() => void refetch()}>
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Выйти из кабинета" loading={logout.isPending}
              onClick={() => logout.mutate()}>
              <LogOut className="h-3.5 w-3.5 text-error" />
            </Button>
          </div>
        </div>

        {s ? <SubLine s={s} /> : (
          <p className="text-[12px] text-text-muted">Активная подписка в кабинете не найдена.</p>
        )}

        {/* Expandable detail tabs */}
        <div className="flex flex-wrap gap-1.5">
          <TabButton active={open === 'balance'} icon={<Wallet className="h-3.5 w-3.5" />} label="Баланс" onClick={() => toggle('balance')} />
          {s && <TabButton active={open === 'renew'} icon={<CalendarClock className="h-3.5 w-3.5" />} label="Продление" onClick={() => toggle('renew')} />}
          {s && <TabButton active={open === 'devices'} icon={<MonitorSmartphone className="h-3.5 w-3.5" />} label="Устройства" onClick={() => toggle('devices')} />}
        </div>

        {open === 'balance' && <BalanceSection />}
        {open === 'renew' && s && <RenewSection autopayEnabled={s.autopayEnabled} />}
        {open === 'devices' && s && <DevicesSection deviceLimit={s.deviceLimit} />}

        {s && (
          <Button variant="ghost" size="sm" className="self-start" loading={importing}
            onClick={() => { setImporting(true); void autoImport().finally(() => setImporting(false)) }}>
            <RefreshCw className="h-3.5 w-3.5" /> Импортировать заново
          </Button>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
        active ? 'bg-accent/12 text-accent' : 'bg-bg-secondary text-text-muted hover:text-text-secondary',
      )}>
      {icon}{label}
    </button>
  )
}

// ── Balance + transactions ────────────────────────────────────────────────────

function BalanceSection() {
  const { data: page, isLoading } = useCabinetTransactions(true)
  const { data: me } = useCabinetMe(true)

  return (
    <div className="rounded-md border border-border bg-bg-secondary/40 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-secondary">Текущий баланс</span>
        <span className="text-[13px] font-semibold text-text-primary">{(me?.balanceRubles ?? 0).toFixed(2)} ₽</span>
      </div>
      <p className="text-[11px] text-text-muted">Последние операции</p>
      {isLoading ? <Spinner className="h-4 w-4" /> : (page?.items.length ? (
        <div className="flex flex-col gap-1">
          {page.items.slice(0, 6).map(t => (
            <div key={t.id} className="flex items-center justify-between text-[11px]">
              <span className="truncate text-text-muted">{t.description || t.type}</span>
              <span className={cn('font-medium shrink-0 ml-2', t.amountRubles >= 0 ? 'text-connected' : 'text-text-secondary')}>
                {t.amountRubles >= 0 ? '+' : ''}{t.amountRubles.toFixed(2)} ₽
              </span>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-text-muted">Операций пока нет.</p>)}
    </div>
  )
}

// ── Renewal + autopay ─────────────────────────────────────────────────────────

function RenewSection({ autopayEnabled }: { autopayEnabled: boolean }) {
  const { data: options, isLoading } = useCabinetRenewalOptions(true)
  const { notify } = useUIStore()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<number | null>(null)
  const [autopay, setAutopay] = useState(autopayEnabled)
  const [autopayBusy, setAutopayBusy] = useState(false)

  const doRenew = async (periodDays: number) => {
    setBusy(periodDays)
    try {
      await cabinetApi.renew(periodDays)
      await qc.invalidateQueries({ queryKey: ['cabinet'] })
      notify({ type: 'success', title: 'Подписка продлена', message: `+${periodDays} дней` })
    } catch (e) {
      notify({ type: 'error', title: 'Не удалось продлить', message: e instanceof Error ? e.message : 'Ошибка' })
    } finally { setBusy(null) }
  }

  const toggleAutopay = async (v: boolean) => {
    setAutopayBusy(true); setAutopay(v)
    try {
      await cabinetApi.setAutopay(v)
      notify({ type: 'success', title: 'Автопродление', message: v ? 'Включено' : 'Выключено' })
    } catch (e) {
      setAutopay(!v)
      notify({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось изменить' })
    } finally { setAutopayBusy(false) }
  }

  return (
    <div className="rounded-md border border-border bg-bg-secondary/40 flex flex-col">
      <ToggleRow label="Автопродление" sub="Списывать с баланса перед окончанием"
        value={autopay} onChange={toggleAutopay} loading={autopayBusy} />
      <div className="px-3 pb-3 flex flex-col gap-2">
        <p className="text-[11px] text-text-muted">Продлить с баланса кабинета:</p>
        {isLoading ? <Spinner className="h-4 w-4" /> : (options?.length ? (
          <div className="flex flex-wrap gap-2">
            {options.map(o => (
              <Button key={o.periodDays} variant="secondary" size="sm" loading={busy === o.periodDays}
                onClick={() => void doRenew(o.periodDays)}>
                {o.periodDays} дн. · {o.priceRubles.toFixed(0)} ₽
                {o.discountPercent > 0 && <span className="ml-1 text-connected">−{o.discountPercent}%</span>}
              </Button>
            ))}
          </div>
        ) : <p className="text-[11px] text-text-muted">Нет доступных вариантов продления.</p>)}
        <button
          onClick={() => { try { window.open('https://cabinet.slave-apps.online', '_system') } catch { /* */ } }}
          className="inline-flex items-center gap-1 self-start text-[11px] text-accent hover:opacity-80">
          <ExternalLink className="h-3 w-3" /> Пополнить баланс в кабинете
        </button>
      </div>
    </div>
  )
}

// ── Devices ─────────────────────────────────────────────────────────────────

function DevicesSection({ deviceLimit }: { deviceLimit: number }) {
  const { data, isLoading, refetch } = useCabinetDevices(true)
  const { notify } = useUIStore()
  const [removing, setRemoving] = useState<string | null>(null)

  const remove = async (hwid: string) => {
    setRemoving(hwid)
    try {
      await cabinetApi.removeDevice(hwid)
      await refetch()
      notify({ type: 'success', title: 'Устройство отвязано', message: '' })
    } catch (e) {
      notify({ type: 'error', title: 'Не удалось отвязать', message: e instanceof Error ? e.message : 'Ошибка' })
    } finally { setRemoving(null) }
  }

  return (
    <div className="rounded-md border border-border bg-bg-secondary/40 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-secondary">Подключённые устройства</span>
        <Badge tone="neutral">{data?.total ?? 0} / {deviceLimit}</Badge>
      </div>
      {isLoading ? <Spinner className="h-4 w-4" /> : (data?.devices.length ? (
        <div className="flex flex-col gap-1.5">
          {data.devices.map(d => (
            <div key={d.hwid} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] text-text-primary truncate">{d.localName || d.deviceModel}</p>
                <p className="text-[10px] text-text-muted truncate">{d.platform}</p>
              </div>
              <Button variant="ghost" size="icon-sm" title="Отвязать" loading={removing === d.hwid}
                onClick={() => void remove(d.hwid)}>
                <Trash2 className="h-3.5 w-3.5 text-error" />
              </Button>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-text-muted">Нет активных устройств.</p>)}
    </div>
  )
}

function SubLine({ s }: { s: CabinetSubscriptionInfo }) {
  const tone: 'ok' | 'warn' | 'neutral' = s.isActive ? 'ok' : s.isExpired ? 'warn' : 'neutral'
  const label = s.isActive ? (s.isTrial ? 'Пробная' : 'Активна') : s.isExpired ? 'Истекла' : s.status
  const pct = Math.min(100, Math.max(0, Math.round(s.trafficUsedPercent)))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-secondary">
        <Badge tone={tone}><CheckCircle className="h-3 w-3 mr-1" />{label}</Badge>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-text-muted" />{s.timeLeftDisplay || `${s.daysLeft} дн.`}</span>
        <span className="inline-flex items-center gap-1"><HardDrive className="h-3 w-3 text-text-muted" />{s.trafficUsedGb.toFixed(1)}{s.trafficLimitGb > 0 ? ` / ${s.trafficLimitGb} ГБ` : ' ГБ'}</span>
        <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3 text-text-muted" />{s.deviceLimit} устр.</span>
      </div>
      {s.trafficLimitGb > 0 && (
        <div className="h-1 w-full rounded-full bg-bg-tertiary overflow-hidden">
          <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-connecting' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
