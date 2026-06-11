import { NavLink } from 'react-router-dom'
import { Power, Server, Layers, Route, Shield, Activity, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'

// Aurora Android bottom tab bar — 7 tabs (07-SCREENS-ANDROID.md). Routes are
// unchanged; only the icons/labels/active style match the spec.
const NAV_ITEMS = [
  { to: '/dashboard',     icon: Power,    label: 'Главная' },
  { to: '/servers',       icon: Server,   label: 'Серверы' },
  { to: '/subscriptions', icon: Layers,   label: 'Подписки' },
  { to: '/routing',       icon: Route,    label: 'Маршрут' },
  { to: '/dns',           icon: Shield,   label: 'DNS' },
  { to: '/diagnostics',   icon: Activity, label: 'Диагн.' },
  { to: '/settings',      icon: Settings, label: 'Ещё' },
] as const

/**
 * Bottom tab bar for the Capacitor Android shell. Replaces the desktop Sidebar.
 * Active tab → `accentSoft` pill behind the icon, accent icon (stroke 2.2) +
 * label (weight 600). Honours the device safe-area (gesture nav) via padding.
 */
export function MobileNav() {
  return (
    <nav
      className="shrink-0 border-t border-border bg-bg-primary/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className="min-w-0 flex-1">
            {({ isActive }) => (
              <div className="flex flex-col items-center justify-center gap-1 pt-2 pb-1.5">
                {/* Pill behind the icon (44×26) — only on the active tab */}
                <span
                  className={cn(
                    'flex h-[26px] w-11 items-center justify-center rounded-full transition-colors',
                    isActive ? 'bg-accent/12' : 'bg-transparent',
                  )}
                >
                  <Icon
                    className={cn('h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-accent' : 'text-text-muted')}
                    strokeWidth={isActive ? 2.2 : 2}
                  />
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[10px] leading-none transition-colors',
                    isActive ? 'font-semibold text-accent' : 'font-medium text-text-muted',
                  )}
                >
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
