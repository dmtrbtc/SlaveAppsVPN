import { NavLink } from 'react-router-dom'
import {
  Shield, Globe, Route, Layers, Activity, Settings, ScanLine,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard', icon: Shield, label: 'VPN' },
  { to: '/servers', icon: Globe, label: 'Серверы' },
  { to: '/subscriptions', icon: ScanLine, label: 'Ключи' },
  { to: '/routing', icon: Route, label: 'Маршруты' },
  { to: '/dns', icon: Layers, label: 'DNS' },
  { to: '/diagnostics', icon: Activity, label: 'Диагн.' },
  { to: '/settings', icon: Settings, label: 'Ещё' },
] as const

/**
 * Bottom tab bar for the Capacitor Android shell. Replaces the desktop
 * Sidebar. Honours the device safe-area (gesture nav bar) via padding.
 */
export function MobileNav() {
  return (
    <nav
      className="shrink-0 border-t border-border bg-bg-primary/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className="flex-1 min-w-0"
          >
            {({ isActive }) => (
              <div
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 transition-colors',
                  isActive ? 'text-text-accent' : 'text-text-muted'
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(255,122,89,0.5)]')} />
                <span className="text-[10px] font-medium leading-none truncate max-w-full">
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
