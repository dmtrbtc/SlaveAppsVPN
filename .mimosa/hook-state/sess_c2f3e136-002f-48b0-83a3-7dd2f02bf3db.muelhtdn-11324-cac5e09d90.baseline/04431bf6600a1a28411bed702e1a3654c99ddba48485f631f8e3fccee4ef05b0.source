import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { getInstalledVersionNotes, getCurrentVersion } from '../../android/update-check'

// v2: v1 was seeded on first launch even for users updating FROM a pre-whatsnew
// build (marker was missing → treated as a fresh install → silently seeded → the
// card never showed). Bumping the key resets that one-time bad seed so the card
// can appear on the update that ships this fix.
const LS_KEY = 'slave.whatsnew.lastSeenVersion.v2'

/**
 * Post-update «Что нового» card. Compares the version this build was launched as
 * against the last version the user saw (localStorage). When it changed — i.e. the
 * app just updated — it fetches that version's GitHub release notes and shows them
 * once. A first-ever launch seeds the marker silently (nothing to announce), and we
 * advance the marker the moment an update is detected so the card never nags across
 * launches (offline / no-notes → simply nothing is shown this time).
 *
 * Cross-platform, renderer-only: reuses the update-check GitHub fetch that already
 * works on Android (CapacitorHttp) and Windows (main-process proxy).
 */
export function WhatsNewModal() {
  const [data, setData] = useState<{ version: string; notes: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const current = getCurrentVersion()
    if (!current) return

    let lastSeen: string | null = null
    try { lastSeen = window.localStorage.getItem(LS_KEY) } catch { /* ignore */ }

    if (lastSeen === current) return // already seen the current version

    // No marker yet: distinguish a GENUINELY fresh install (empty storage → seed
    // silently, nothing to announce) from a user updating from a pre-whatsnew build
    // (marker missing but prior app data exists → show the notes once). Any other
    // localStorage key is evidence the app was used before.
    if (!lastSeen) {
      let hasPriorData = false
      try { hasPriorData = Object.keys(window.localStorage).some(k => k !== LS_KEY) } catch { /* ignore */ }
      if (!hasPriorData) {
        try { window.localStorage.setItem(LS_KEY, current) } catch { /* ignore */ }
        return
      }
    }

    // Updated (or returning from a pre-whatsnew build). Advance the marker NOW (no
    // nagging), then surface this version's notes — silently skips if offline / none.
    try { window.localStorage.setItem(LS_KEY, current) } catch { /* ignore */ }
    void (async () => {
      const info = await getInstalledVersionNotes()
      if (cancelled || !info) return
      setData({ version: info.version, notes: info.notes })
    })()

    return () => { cancelled = true }
  }, [])

  if (!data) return null

  const close = () => setData(null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-bg-secondary shadow-xl"
        onClick={e => e.stopPropagation()}
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">Что нового</p>
            <p className="text-[11px] text-text-muted">{data.version}</p>
          </div>
          <button onClick={close} className="p-1 text-text-muted hover:text-text-secondary" aria-label="закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-text-secondary">{data.notes}</pre>
        </div>
        <div className="border-t border-border px-4 py-3">
          <button onClick={close} className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white">
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}
