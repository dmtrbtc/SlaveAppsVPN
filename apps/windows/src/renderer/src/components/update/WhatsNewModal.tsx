import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { getInstalledVersionNotes, getCurrentVersion } from '../../android/update-check'

const LS_KEY = 'slave.whatsnew.lastSeenVersion.v1'

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

    // First-ever launch: seed the marker, don't announce (nothing changed for them).
    if (!lastSeen) {
      try { window.localStorage.setItem(LS_KEY, current) } catch { /* ignore */ }
      return
    }
    if (lastSeen === current) return // already seen the current version

    // Updated since the last launch. Advance the marker NOW (no nagging), then try
    // to surface this version's notes — silently skips if offline or none exist.
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
