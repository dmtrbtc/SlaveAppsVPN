import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Shield, Globe, Route, Layers, Activity, Settings,
  ChevronLeft, ChevronRight, ScanLine,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUIStore } from '../../stores/ui.store'
import { useVpnStore, selectConnectionState } from '../../stores/vpn.store'

const NAV_ITEMS = [
  { to: '/dashboard', icon: Shield, label: 'Подключение' },
  { to: '/servers', icon: Globe, label: 'Серверы' },
  { to: '/subscriptions', icon: ScanLine, label: 'Подписки' },
  { to: '/routing', icon: Route, label: 'Маршрутизация' },
  { to: '/dns', icon: Layers, label: 'DNS' },
  { to: '/diagnostics', icon: Activity, label: 'Диагностика' },
] as const

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const connectionState = useVpnStore(selectConnectionState)

  const w = sidebarCollapsed ? 56 : 196

  return (
    <motion.aside
      animate={{ width: w }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-bg-primary py-2 overflow-hidden"
    >
      <nav className="flex flex-1 flex-col gap-0.5 px-1.5">
        <LayoutGroup id="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}>
              {({ isActive }) => (
                <div
                  className={cn(
                    'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-150 cursor-default',
                    isActive
                      ? 'bg-accent/15 text-text-accent'
                      : 'text-text-muted hover:bg-bg-tertiary hover:text-text-secondary'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <AnimatePresence mode="wait">
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </NavLink>
          ))}
        </LayoutGroup>
      </nav>

      <div className="px-1.5 mt-auto flex flex-col gap-0.5">
        <StatusDot state={connectionState} collapsed={sidebarCollapsed} />

        <NavLink to="/settings">
          {({ isActive }) => (
            <div
              className={cn(
                'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-150 cursor-default',
                isActive
                  ? 'bg-accent/15 text-text-accent'
                  : 'text-text-muted hover:bg-bg-tertiary hover:text-text-secondary'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <AnimatePresence mode="wait">
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    Настройки
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}
        </NavLink>

        <button
          onClick={toggleSidebar}
          className="flex h-10 items-center gap-3 rounded-xl px-3 text-text-muted hover:bg-bg-tertiary hover:text-text-secondary transition-all duration-150 cursor-default w-full"
        >
          {sidebarCollapsed
            ? <ChevronRight className="h-4 w-4 shrink-0" />
            : <ChevronLeft className="h-4 w-4 shrink-0" />
          }
          <AnimatePresence mode="wait">
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="text-sm"
              >
                Свернуть
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}

function StatusDot({ state, collapsed }: { state: string; collapsed: boolean }) {
  const color =
    state === 'connected' ? 'bg-connected' :
    state === 'connecting' || state === 'reconnecting' ? 'bg-connecting' :
    state === 'error' ? 'bg-error' : 'bg-text-muted'

  const label =
    state === 'connected' ? 'Подключено' :
    state === 'connecting' ? 'Подключение...' :
    state === 'reconnecting' ? 'Переподключение...' :
    state === 'error' ? 'Ошибка' : 'Отключено'

  return (
    <div className="flex h-8 items-center gap-3 px-3 mb-1">
      <div className={cn(
        'h-2 w-2 rounded-full shrink-0',
        color,
        (state === 'connecting' || state === 'reconnecting') && 'animate-pulse'
      )} />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-text-muted whitespace-nowrap"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
