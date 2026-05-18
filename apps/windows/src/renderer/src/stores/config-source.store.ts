import { create } from 'zustand'
import type { ConfigSourceMeta, ConfigSourceType, ConfigSourceValidateResult } from '@shared/ipc/types'
import { configSourceApi } from '../lib/api'

type SetPhase = 'idle' | 'validating' | 'saving' | 'done' | 'error'

interface ConfigSourceStore {
  meta: ConfigSourceMeta | null
  phase: SetPhase
  error: string | null
  validationResult: ConfigSourceValidateResult | null

  validate: (type: ConfigSourceType, input: string) => Promise<ConfigSourceValidateResult>
  save: (type: ConfigSourceType, input: string) => Promise<ConfigSourceMeta>
  clear: () => Promise<void>
  resetValidation: () => void
}

export const useConfigSourceStore = create<ConfigSourceStore>()((set) => ({
  meta: null,
  phase: 'idle',
  error: null,
  validationResult: null,

  validate: async (type, input) => {
    set({ phase: 'validating', error: null, validationResult: null })
    try {
      const result = await configSourceApi.validate({ type, input })
      set({ phase: 'idle', validationResult: result })
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      set({ phase: 'error', error: message })
      return { valid: false, error: message }
    }
  },

  save: async (type, input) => {
    set({ phase: 'saving', error: null })
    try {
      const meta = await configSourceApi.set({ type, input })
      set({ meta, phase: 'done', error: null })
      return meta
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      set({ phase: 'error', error: message })
      throw err
    }
  },

  clear: async () => {
    await configSourceApi.clear()
    set({ meta: null, phase: 'idle', error: null, validationResult: null })
  },

  resetValidation: () => {
    set({ phase: 'idle', error: null, validationResult: null })
  },
}))
