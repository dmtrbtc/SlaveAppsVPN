import { useEffect } from 'react'
import type { VpnHealthPayload } from '@shared/ipc/types'
import { vpnApi } from '../lib/api'
import { IS_MOBILE } from '../lib/platform'
import {
  useVpnStore,
  selectConnectionState,
  selectSelectedProxy,
  AUTO_GROUP,
} from '../stores/vpn.store'

const PROBE_INTERVAL_MS = 15000
// Require this many consecutive url-test failures before reporting "no internet",
// so a single transient blip doesn't flip the badge to red.
const FAIL_THRESHOLD = 2

function makeHealth(ok: boolean, trafficActive: boolean): VpnHealthPayload {
  return {
    processAlive: true,      // the foreground service is up (we're "connected")
    apiResponding: ok,       // the url-test round-tripped through the mihomo core
    connectivityOk: ok,      // the proxy reached the test URL through the tunnel
    dnsOk: ok,               // a successful url-test implies name resolution worked
    tunAvailable: true,      // the TUN interface is established while connected
    trafficActive,           // real bytes are flowing (from the traffic stats)
    checkedAt: Date.now(),
  }
}

/**
 * Android has no native health events (onVpnHealth is a no-op there), so the
 * connection-quality badge would otherwise show a fabricated "good". This hook
 * synthesizes REAL health while connected on Android by periodically url-testing
 * the active node THROUGH the tunnel (mihomo testDelay) — a genuine end-to-end
 * liveness probe. It's read-only: it drives the badge, it never reconnects.
 *
 * No-op on Windows (real native health is used) and while disconnected.
 */
export function useAndroidConnectionHealth(): void {
  const state = useVpnStore(selectConnectionState)
  const activeProxy = useVpnStore(s => s.activeProxy)
  const selectedProxy = useVpnStore(selectSelectedProxy)
  const setHealth = useVpnStore(s => s.setHealth)

  useEffect(() => {
    if (!IS_MOBILE) return
    if (state !== 'connected') {
      setHealth(null)
      return
    }

    let cancelled = false
    let fails = 0
    // Prefer the real leaf node; fall back to the selected target / the Auto group.
    const target = activeProxy || selectedProxy || AUTO_GROUP

    const probe = async (): Promise<void> => {
      const t = useVpnStore.getState().traffic
      const trafficActive = t.downloadSpeedBps + t.uploadSpeedBps > 0
      try {
        const res = await vpnApi.testDelay({ name: target, timeout: 5000 })
        if (cancelled) return
        const ok = res !== null && res.delay > 0 && res.delay < 65535
        if (ok) {
          fails = 0
          setHealth(makeHealth(true, trafficActive))
        } else {
          fails += 1
          if (fails >= FAIL_THRESHOLD) setHealth(makeHealth(false, trafficActive))
        }
      } catch {
        if (cancelled) return
        fails += 1
        if (fails >= FAIL_THRESHOLD) setHealth(makeHealth(false, trafficActive))
      }
    }

    void probe()
    const id = setInterval(() => void probe(), PROBE_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [state, activeProxy, selectedProxy, setHealth])
}
