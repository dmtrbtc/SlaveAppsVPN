import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AppNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
}

interface UIStore {
  sidebarCollapsed: boolean
  notifications: AppNotification[]

  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  notify: (n: Omit<AppNotification, 'id'>) => void
  dismissNotification: (id: string) => void
}

let _notifCounter = 0

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      notifications: [],

      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      notify: (n) => {
        const id = `notif-${++_notifCounter}`
        set(s => ({ notifications: [...s.notifications, { ...n, id }] }))
        const duration = n.duration ?? 4000
        if (duration > 0) {
          setTimeout(() => set(s => ({
            notifications: s.notifications.filter(x => x.id !== id),
          })), duration)
        }
      },

      dismissNotification: (id) =>
        set(s => ({ notifications: s.notifications.filter(x => x.id !== id) })),
    }),
    { name: 'slave-vpn-ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
)
