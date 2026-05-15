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
  serverFavorites: string[]
  notifications: AppNotification[]
  _notifTimers: Map<string, ReturnType<typeof setTimeout>>

  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  toggleServerFavorite: (id: string) => void
  notify: (n: Omit<AppNotification, 'id'>) => void
  dismissNotification: (id: string) => void
}

let _notifCounter = 0

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      serverFavorites: [],
      notifications: [],
      _notifTimers: new Map(),

      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      toggleServerFavorite: (id) => set(s => ({
        serverFavorites: s.serverFavorites.includes(id)
          ? s.serverFavorites.filter(x => x !== id)
          : [...s.serverFavorites, id],
      })),

      notify: (n) => {
        const id = `notif-${++_notifCounter}`
        set(s => ({ notifications: [...s.notifications, { ...n, id }] }))
        const duration = n.duration ?? 4000
        if (duration > 0) {
          const timer = setTimeout(() => {
            get()._notifTimers.delete(id)
            set(s => ({ notifications: s.notifications.filter(x => x.id !== id) }))
          }, duration)
          get()._notifTimers.set(id, timer)
        }
      },

      dismissNotification: (id) => {
        const timer = get()._notifTimers.get(id)
        if (timer) {
          clearTimeout(timer)
          get()._notifTimers.delete(id)
        }
        set(s => ({ notifications: s.notifications.filter(x => x.id !== id) }))
      },
    }),
    {
      name: 'slave-vpn-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        serverFavorites: s.serverFavorites,
      }),
    }
  )
)
