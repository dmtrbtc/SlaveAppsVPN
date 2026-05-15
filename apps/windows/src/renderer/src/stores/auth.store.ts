import { create } from 'zustand'
import type { User } from '@slave-vpn/shared'
import { authApi, events } from '../lib/api'

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

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,

  bootstrap: async () => {
    set({ isBootstrapping: true })
    try {
      const user = await authApi.getMe()
      set({ user, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
    } finally {
      set({ isBootstrapping: false })
    }
  },

  loginEmail: async (email, password) => {
    await authApi.loginEmail(email, password)
    const user = await authApi.getMe()
    set({ user, isAuthenticated: true })
  },

  loginTelegram: async (initData) => {
    await authApi.loginTelegram(initData)
    const user = await authApi.getMe()
    set({ user, isAuthenticated: true })
  },

  logout: async () => {
    await authApi.logout()
    set({ user: null, isAuthenticated: false })
  },

  subscribeToAuthEvents: () => {
    return events.onAuthExpired(() => {
      set({ user: null, isAuthenticated: false })
    })
  },
}))
