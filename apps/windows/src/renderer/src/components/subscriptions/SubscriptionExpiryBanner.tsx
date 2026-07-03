import { AlertTriangle } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'
import { openExternalUrl } from '../../lib/external'

const CABINET_URL = 'https://cabinet.slave-apps.online'
const WARN_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Proactive «подписка истекает» banner. Shows on the Dashboard only when the
 * subscription genuinely ends within WARN_DAYS (or has just expired) — so a
 * healthy long subscription never nags. Data comes from the existing
 * subscription.get; no new backend. Tapping «Продлить» opens the web cabinet.
 */
export function SubscriptionExpiryBanner() {
  const { data: sub } = useSubscription()
  if (!sub || !sub.expiresAt) return null
  // Only for subscriptions that are meant to be active — don't nag on 'none'/'paused'.
  if (sub.status !== 'active' && sub.status !== 'expired' && sub.status !== 'limited') return null

  const endsAt = new Date(sub.expiresAt).getTime()
  if (!Number.isFinite(endsAt)) return null
  const msLeft = endsAt - Date.now()
  const daysLeft = Math.ceil(msLeft / DAY_MS)
  if (daysLeft > WARN_DAYS) return null // plenty of time — stay silent

  const dateStr = new Date(endsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const label =
    msLeft <= 0
      ? 'Подписка истекла'
      : daysLeft <= 1
      ? 'Подписка истекает сегодня'
      : `Подписка истекает через ${daysLeft} дн. (${dateStr})`

  return (
    <div className="flex items-center gap-2 border-b border-connecting/30 bg-connecting/10 px-4 py-2 sm:px-6">
      <AlertTriangle className="h-4 w-4 shrink-0 text-connecting" />
      <p className="flex-1 min-w-0 text-[12px] font-medium text-connecting">{label}</p>
      <button
        onClick={() => openExternalUrl(CABINET_URL)}
        className="shrink-0 rounded-md bg-connecting/15 px-2.5 py-1 text-[11px] font-medium text-connecting transition-colors hover:bg-connecting/25"
      >
        Продлить
      </button>
    </div>
  )
}
