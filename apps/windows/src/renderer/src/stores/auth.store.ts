import { create } from 'zustand'
import type { User } from '@slave-vpn/shared'
import type { ConfigSourceMeta } from '@shared/ipc/types'
import { authApi, configSourceApi, events } from '../lib/api'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  configSourceMeta: ConfigSourceMeta | null
  isBootstrapping: boolean

  // True if the app has any valid way to connect (provider auth OR stored config source)
  hasAccess: boolean

  bootstrap: () => Promise<void>
  loginEmail: (email: string, password: string) => Promise<void>
  loginTelegram: (initData: string) => Promise<void>
  logout: () => Promise<void>
  setConfigSourceMeta: (meta: ConfigSourceMeta | null) => void
  subscribeToAuthEvents: () => () => void
}

function computeHasAccess(isAuthenticated: boolean, configSourceMeta: ConfigSourceMeta | null): boolean {
  return isAuthenticated || configSourceMeta !== null
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isAuthenticated: false,
  configSourceMeta: null,
  isBootstrapping: true,
  hasAccess: false,

  bootstrap: async () => {
    set({ isBootstrapping: true })

    let user: User | null = null
    let isAuthenticated = false
    let configSourceMeta: ConfigSourceMeta | null = null

    // Check for stored config source (non-provider path)
    try {
      configSourceMeta = await configSourceApi.getMeta()
    } catch {
      // ignore — no config source stored
    }

    // Try provider auth
    try {
      user = await authApi.getMe()
      isAuthenticated = true
    } catch {
      // no provider session
    }

    set({
      user,
      isAuthenticated,
      configSourceMeta,
      hasAccess: computeHasAccess(isAuthenticated, configSourceMeta),
      isBootstrapping: false,
    })
  },

  loginEmail: async (email, password) => {
    await authApi.loginEmail(email, password)
    const user = await authApi.getMe()
    set({ user, isAuthenticated: true, hasAccess: true })
  },

  loginTelegram: async (initData) => {
    await authApi.loginTelegram(initData)
    const user = await authApi.getMe()
    set({ user, isAuthenticated: true, hasAccess: true })
  },

  logout: async () => {
    await authApi.logout()
    // Backend clears both tokens and config source
    set({
      user: null,
      isAuthenticated: false,
      configSourceMeta: null,
      hasAccess: false,
    })
  },

  setConfigSourceMeta: (meta) => {
    set(s => ({
      configSourceMeta: meta,
      hasAccess: computeHasAccess(s.isAuthenticated, meta),
    }))
  },

  subscribeToAuthEvents: () => {
    return events.onAuthExpired(() => {
      set(s => ({
        user: null,
        isAuthenticated: false,
        hasAccess: computeHasAccess(false, s.configSourceMeta),
      }))
    })
  },
}))
