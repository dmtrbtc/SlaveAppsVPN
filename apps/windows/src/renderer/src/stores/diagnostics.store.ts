import { create } from 'zustand'
import type { RuntimeEvent } from '@shared/ipc/types'
import { events } from '../lib/api'

const MAX_EVENTS = 200

interface DiagnosticsStore {
  eventLog: RuntimeEvent[]
  subscribeToEvents: () => () => void
}

export const useDiagnosticsStore = create<DiagnosticsStore>()((set) => ({
  eventLog: [],

  subscribeToEvents: () => {
    const unsub = events.onRuntimeEvent(event => {
      set(s => ({
        eventLog: [event, ...s.eventLog].slice(0, MAX_EVENTS),
      }))
    })
    return unsub
  },
}))

export const selectEventLog = (s: DiagnosticsStore) => s.eventLog
