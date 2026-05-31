/*
 * Stable per-install device identity for Android (HWID).
 *
 * WHY: Remnawave panels with the HWID device-limit feature enabled only serve
 * real nodes when the request carries an `x-hwid` header that identifies the
 * device (and counts against the per-subscription device limit). Without it the
 * panel returns a placeholder ("App not supported" / empty proxy list) — which
 * is exactly why the server list showed up empty on the phone.
 *
 * The desktop app derives its HWID from the Windows MachineGuid
 * (see main/services/impl/WindowsDeviceIdentity.ts). In the Android WebView we
 * have no such machine id, so we generate a random UUID once and persist it in
 * localStorage. It must stay stable across launches so the panel keeps counting
 * the same device instead of burning a new device slot every time.
 */

const HWID_KEY = 'slavevpn.hwid.v1'

function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  // Fallback for very old WebViews without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

let cached: string | null = null

/**
 * Returns a stable device id, generating + persisting one on first use.
 * Prefixed so it's recognizable in the Remnawave device list.
 */
export function getDeviceHwid(): string {
  if (cached) return cached
  try {
    const stored = localStorage.getItem(HWID_KEY)
    if (stored && stored.length > 0) {
      cached = stored
      return stored
    }
  } catch {
    /* localStorage unavailable — fall through to ephemeral id */
  }

  const id = `slavevpn-android-${generateId()}`
  try {
    localStorage.setItem(HWID_KEY, id)
  } catch {
    /* best-effort: still return the id for this session */
  }
  cached = id
  return id
}

/**
 * Device headers Remnawave reads for the HWID feature. x-hwid is the only
 * strictly required one; the rest populate the device list in the panel.
 */
export function getDeviceHeaders(): Record<string, string> {
  return {
    'x-hwid': getDeviceHwid(),
    'x-device-os': 'Android',
    'x-device-model': 'SLAVE VPN (Android)',
    'x-ver-os': androidVersion(),
  }
}

function androidVersion(): string {
  try {
    const m = navigator.userAgent.match(/Android\s+([\d.]+)/)
    return m?.[1] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
