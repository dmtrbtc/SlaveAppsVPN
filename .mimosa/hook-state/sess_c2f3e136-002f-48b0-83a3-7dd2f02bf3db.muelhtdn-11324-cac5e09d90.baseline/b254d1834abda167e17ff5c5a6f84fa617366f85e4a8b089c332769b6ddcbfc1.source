import { useEffect, useState } from 'react'
import { Download, X, ArrowUpCircle, Loader2, RotateCw, CheckCircle2 } from 'lucide-react'
import { checkForUpdate, openUpdate, type UpdateInfo } from '../../android/update-check'
import { useInAppUpdate } from '../../hooks/useInAppUpdate'
import { useSettings } from '../../hooks/useSettings'

const DISMISS_LS_KEY = 'slave.update.dismissed.v1'

/**
 * Cross-platform in-app update banner. Detects a newer build via GitHub Releases,
 * then downloads + installs IN-APP (no browser): Windows via electron-updater
 * (progress → «Перезапустить и установить»), Android via the native PackageInstaller
 * (progress → the system install sheet). Falls back to opening the download in the
 * browser only if the in-app path is unavailable. Dismissal is remembered per version.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const { data: settings } = useSettings()
  const channel = settings?.updateChannel ?? 'stable'
  const { phase, progress, error, start, restart } = useInAppUpdate(info, channel)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const u = await checkForUpdate(channel)
      if (cancelled || !u) return
      try {
        if (window.localStorage.getItem(DISMISS_LS_KEY) === u.version) return // dismissed this version
      } catch { /* ignore */ }
      setInfo(u)
    })()
    return () => { cancelled = true }
  }, [channel])

  if (!info) return null

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_LS_KEY, info.version) } catch { /* ignore */ }
    setInfo(null)
  }

  const busy = phase === 'checking' || phase === 'downloading'

  // Right-hand control depends on phase.
  let action: React.ReactNode
  if (phase === 'ready') {
    // Windows: downloaded, ready to relaunch.
    action = (
      <button
        onClick={() => void restart()}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent text-white shrink-0"
      >
        <RotateCw className="h-3 w-3" /> Перезапустить
      </button>
    )
  } else if (phase === 'installing') {
    action = (
      <span className="flex items-center gap-1 text-[11px] text-accent shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5" /> Подтвердите установку
      </span>
    )
  } else if (busy) {
    action = (
      <span className="flex items-center gap-1 text-[11px] text-accent shrink-0 tabular-nums">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {phase === 'downloading' ? `${progress}%` : '…'}
      </span>
    )
  } else {
    // idle or error → offer the (re)try button.
    action = (
      <button
        onClick={() => void start()}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-accent text-white shrink-0"
      >
        <Download className="h-3 w-3" /> {phase === 'error' ? 'Повторить' : 'Обновить'}
      </button>
    )
  }

  const subtitle =
    phase === 'error'
      ? (error ?? 'Не удалось обновить')
      : phase === 'downloading'
      ? `Загрузка обновления… ${progress}%`
      : phase === 'installing'
      ? 'Подтвердите установку в системном окне'
      : phase === 'ready'
      ? 'Загружено — нажмите «Перезапустить», чтобы установить'
      : 'Скачивание и установка — прямо в приложении'

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/25">
      <ArrowUpCircle className="h-4 w-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-accent">Доступна новая версия {info.version}</p>
        <p className={`text-[10px] truncate ${phase === 'error' ? 'text-error' : 'text-text-muted'}`}>{subtitle}</p>
        {phase === 'downloading' && (
          <div className="mt-1 h-1 w-full rounded-full bg-accent/15 overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {phase === 'error' && (
        <button
          onClick={() => openUpdate(info)}
          className="text-[10px] text-text-muted underline shrink-0"
        >
          в браузере
        </button>
      )}
      {action}
      {!busy && phase !== 'installing' && (
        <button onClick={dismiss} className="p-1 text-text-muted hover:text-text-secondary shrink-0" aria-label="скрыть">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
