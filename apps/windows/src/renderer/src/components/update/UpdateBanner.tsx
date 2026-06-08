import { useEffect, useState } from 'react'
import { Download, X, ArrowUpCircle } from 'lucide-react'
import { IS_MOBILE } from '../../lib/platform'
import { checkForUpdate, openUpdate, type UpdateInfo } from '../../android/update-check'

const DISMISS_LS_KEY = 'slave.update.dismissed.v1'

/**
 * Android in-app update banner — "notify + by button". Checks GitHub Releases on
 * mount; if a newer build exists, shows a dismissible banner with a download
 * button (opens the APK in the system browser). Dismissal is remembered per
 * version so it doesn't nag. Android-only (desktop uses electron-updater).
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    if (!IS_MOBILE) return
    let cancelled = false
    void (async () => {
      const u = await checkForUpdate()
      if (cancelled || !u) return
      try {
        if (window.localStorage.getItem(DISMISS_LS_KEY) === u.version) return // dismissed this version
      } catch { /* ignore */ }
      setInfo(u)
    })()
    return () => { cancelled = true }
  }, [])

  if (!IS_MOBILE || !info) return null

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_LS_KEY, info.version) } catch { /* ignore */ }
    setInfo(null)
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/25">
      <ArrowUpCircle className="h-4 w-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-accent">Доступна новая версия {info.version}</p>
        <p className="text-[10px] text-text-muted truncate">Нажмите «Скачать», чтобы обновить приложение</p>
      </div>
      <button
        onClick={() => openUpdate(info)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent text-white shrink-0"
      >
        <Download className="h-3 w-3" /> Скачать
      </button>
      <button onClick={dismiss} className="p-1 text-text-muted hover:text-text-secondary shrink-0" aria-label="скрыть">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
