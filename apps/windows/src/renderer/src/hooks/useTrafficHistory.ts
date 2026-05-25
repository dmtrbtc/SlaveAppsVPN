import { useEffect, useRef, useState } from 'react'
import { useVpnStore, selectVpnTraffic } from '../stores/vpn.store'

export interface TrafficSample {
  ts: number
  upBps: number
  downBps: number
}

const DEFAULT_CAPACITY = 60        // 60 samples ≈ 1 minute at 1Hz traffic events
const DEFAULT_FRAME_MS = 1000

interface UseTrafficHistoryOptions {
  capacity?: number
  // When the engine isn't ticking (e.g. between traffic events) we still
  // produce a sample to keep the sparkline animating. Set 0 to disable.
  fallbackFrameMs?: number
}

/**
 * Subscribes to live traffic stats from vpn.store and keeps a ring buffer of
 * recent samples for sparkline rendering. Pure renderer-side — no IPC overhead.
 */
export function useTrafficHistory(opts: UseTrafficHistoryOptions = {}): {
  samples: TrafficSample[]
  peakUp: number
  peakDown: number
} {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY
  const fallback = opts.fallbackFrameMs ?? DEFAULT_FRAME_MS

  const buffer = useRef<TrafficSample[]>([])
  const [snapshot, setSnapshot] = useState<TrafficSample[]>([])

  // Subscribe to traffic store updates and push into the buffer
  useEffect(() => {
    const push = (sample: TrafficSample): void => {
      const next = [...buffer.current, sample]
      if (next.length > capacity) next.shift()
      buffer.current = next
      setSnapshot(next)
    }

    let lastSeen = useVpnStore.getState().traffic
    push({ ts: Date.now(), upBps: lastSeen.uploadSpeedBps, downBps: lastSeen.downloadSpeedBps })

    const unsub = useVpnStore.subscribe(
      selectVpnTraffic,
      (traffic) => {
        lastSeen = traffic
        push({ ts: Date.now(), upBps: traffic.uploadSpeedBps, downBps: traffic.downloadSpeedBps })
      },
    )

    // Fallback ticker — paint a sample even when the engine is silent,
    // so the chart decays back to zero instead of freezing.
    let timer: ReturnType<typeof setInterval> | null = null
    if (fallback > 0) {
      timer = setInterval(() => {
        const now = Date.now()
        const last = buffer.current[buffer.current.length - 1]
        // Only synthesise if no real sample arrived in the last fallback window
        if (last && now - last.ts < fallback - 100) return
        push({ ts: now, upBps: lastSeen.uploadSpeedBps, downBps: lastSeen.downloadSpeedBps })
      }, fallback)
    }

    return () => {
      unsub()
      if (timer) clearInterval(timer)
    }
  }, [capacity, fallback])

  const peakUp = snapshot.reduce((m, s) => Math.max(m, s.upBps), 0)
  const peakDown = snapshot.reduce((m, s) => Math.max(m, s.downBps), 0)

  return { samples: snapshot, peakUp, peakDown }
}
