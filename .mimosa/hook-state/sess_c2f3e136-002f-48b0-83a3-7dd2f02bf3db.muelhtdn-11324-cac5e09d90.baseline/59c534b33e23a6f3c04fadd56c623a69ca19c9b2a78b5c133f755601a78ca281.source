import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { CabinetPanel } from '../components/cabinet/CabinetPanel'
import { useAuthStore } from '../stores/auth.store'

/**
 * Standalone cabinet login (/cabinet-login) — reachable from Onboarding BEFORE
 * the user has any access. The panel auto-imports the cabinet subscription on
 * login; once that grants access, this page forwards into the app. Inside the
 * app the same panel lives at the top of the Подписки tab.
 */
export function CabinetPage() {
  const navigate = useNavigate()
  const hasAccess = useAuthStore(s => s.hasAccess)

  useEffect(() => {
    if (hasAccess) navigate('/dashboard', { replace: true })
  }, [hasAccess, navigate])

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg-base">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <button onClick={() => navigate('/onboarding')} className="text-text-muted hover:text-text-secondary" aria-label="назад">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[15px] font-semibold text-text-primary">Личный кабинет</h2>
      </div>
      <div className="flex flex-col gap-5 px-6 py-5 max-w-2xl w-full">
        <CabinetPanel />
      </div>
    </div>
  )
}
