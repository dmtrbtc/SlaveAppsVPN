import { Mail, Send, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useCabinetMe, useCabinetInvalidate } from '../../hooks/useCabinet'
import { openExternalUrl } from '../../lib/external'

// Web cabinet (the API base minus /api). Linking a Telegram account to an
// existing email account happens here — the app surfaces the action and reflects
// the result from `me.telegramId` after the user returns and refreshes.
const CABINET_WEB_URL = 'https://cabinet.slave-apps.online'

/**
 * Account identity card — who you are at the top of the «Аккаунт» section:
 * display name, email + verification state, and Telegram link status with a
 * one-tap «Привязать Telegram» (opens the web cabinet where linking lives).
 */
export function AccountIdentityCard() {
  const { data: me, isLoading } = useCabinetMe(true)
  const invalidate = useCabinetInvalidate()

  if (isLoading || !me) return null

  const tgLinked = me.telegramId != null
  const displayName =
    me.username || [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email || `ID ${me.id}`
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-primary p-4">
      {/* Identity row */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white text-[16px] font-semibold"
          style={{ background: 'linear-gradient(135deg, #ff7a59 0%, #5b8def 100%)' }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-text-primary">{displayName}</p>
          {me.email ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <Mail className="h-3 w-3 shrink-0 text-text-muted" />
              <span className="truncate text-[11px] text-text-muted">{me.email}</span>
              <Badge tone={me.emailVerified ? 'ok' : 'warn'} className="shrink-0 text-[9px]">
                {me.emailVerified ? 'подтверждён' : 'не подтверждён'}
              </Badge>
            </div>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-muted">Вход через Telegram</p>
          )}
        </div>
      </div>

      {/* Telegram link row */}
      <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg-secondary px-3 py-2.5">
        <Send className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-text-primary">Telegram</p>
          {tgLinked ? (
            <p className="text-[11px] text-connected">
              Привязан{me.username ? ` · @${me.username}` : ''}
            </p>
          ) : (
            <p className="text-[11px] text-text-muted">Не привязан — свяжите для входа и уведомлений</p>
          )}
        </div>
        {tgLinked ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-connected" />
        ) : (
          <Button variant="secondary" size="sm" onClick={() => openExternalUrl(CABINET_WEB_URL)}>
            <ExternalLink className="h-3.5 w-3.5" /> Привязать
          </Button>
        )}
      </div>

      {!tgLinked && (
        <button
          onClick={() => invalidate()}
          className="flex items-center gap-1 self-start text-[11px] text-text-muted transition-colors hover:text-text-secondary"
        >
          <RefreshCw className="h-3 w-3" /> Обновить после привязки
        </button>
      )}
    </div>
  )
}
