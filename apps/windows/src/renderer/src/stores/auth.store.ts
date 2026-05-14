import { create } from 'zustand'
import type { User } from '@slave-vpn/shared'
import { ipc } from '../lib/ipc'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isBootstrapping: boolean

  bootstrap: () => Promise<void>
  loginEmail: (email: string, password: string) => Promise<void>
  loginTelegram: (initData: string) => Promise<void>
  logout: () => Promise<void>
  subscribeToAuthEvents: () => () => void
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,

  bootstrap: async () => {
    set({ isBootstrapping: true })
    try {
      const user = await ipc.auth.getMe()
      if (user) {
        set({ user, isAuthenticated: true })
      } else {
        set({ user: null, isAuthenticated: false })
      }
    } catch {
      set({ user: null, isAuthenticated: false })
    } finally {
      set({ isBootstrapping: false })
    }
  },

  loginEmail: async (email: string, password: string) => {
    const result = await ipc.auth.loginEmail({ email, password })
    if (result?.user) {
      set({ user: result.user, isAuthenticated: true })
    }
  },

  loginTelegram: async (initData: string) => {
    const result = await ipc.auth.loginTelegram({ initData })
    if (result?.user) {
      set({ user: result.user, isAuthenticated: true })
    }
  },

  logout: async () => {
    await ipc.auth.logout()
    set({ user: null, isAuthenticated: false })
  },

  subscribeToAuthEvents: () => {
    const unsubExpired = ipc.events.onAuthExpired(() => {
      set({ user: null, isAuthenticated: false })
    })
    return unsubExpired
  },
}))
