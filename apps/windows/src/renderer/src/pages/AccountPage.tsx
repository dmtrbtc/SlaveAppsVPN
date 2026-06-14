import { CabinetPanel } from '../components/cabinet/CabinetPanel'
import { AccountIdentityCard } from '../components/cabinet/AccountIdentityCard'
import { useCabinetAuthState } from '../hooks/useCabinet'

/**
 * «Аккаунт» — first-class home for the personal cabinet. Identity (email /
 * verification / Telegram link) on top, then the cabinet panel (login when
 * signed out; subscription + balance + renewal + devices + logout when signed
 * in). Cabinet sign-in auto-imports the subscription, which then appears on the
 * Подписки tab.
 */
export function AccountPage() {
  const { data: authState } = useCabinetAuthState()
  const authed = !!authState?.authenticated

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[15px] font-semibold text-text-primary">Аккаунт</h2>
        <p className="text-[12px] text-text-muted mt-0.5">Личный кабинет, подписка и устройства</p>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-4 px-6 py-5">
        {authed && <AccountIdentityCard />}
        <CabinetPanel />
      </div>
    </div>
  )
}
