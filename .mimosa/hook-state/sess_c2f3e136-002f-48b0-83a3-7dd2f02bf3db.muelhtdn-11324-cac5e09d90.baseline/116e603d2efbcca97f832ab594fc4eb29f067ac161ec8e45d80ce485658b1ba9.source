import { useState, useCallback, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { updateApi, events } from '../lib/api'
import { androidDownloadAndInstall, NEEDS_INSTALL_PERMISSION } from '../android/native-updater'
import { openUpdate, type UpdateInfo } from '../android/update-check'
import type { UpdateChannel } from '@shared/ipc/types'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error'

/**
 * Cross-platform in-app update controller (no browser hop).
 *
 * Windows: drives electron-updater — check → download (progress events) → ready →
 * `restart()` quits and installs. The backend (UpdateService) + IPC already exist.
 *
 * Android: calls the native plugin to download the APK in-app (progress) and hand
 * it to the system installer. The OS install sheet then takes over (phase
 * 'installing'); a missing "install unknown apps" grant surfaces a clear hint.
 *
 * Detection of *whether* an update exists stays with the GitHub-Releases check
 * (`info`), which is unified across platforms and carries the version + notes.
 */
export function useInAppUpdate(info: UpdateInfo | null, channel: UpdateChannel) {
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => { cleanupRef.current?.() }, [])

  const start = useCallback(async () => {
    if (!info) return
    setError(null)
    setProgress(0)

    // ── Android: native download + PackageInstaller ──
    if (Capacitor.isNativePlatform()) {
      if (!info.downloadUrl) { openUpdate(info); return } // no APK asset → fall back
      setPhase('downloading')
      try {
        await androidDownloadAndInstall(info.downloadUrl, setProgress)
        setPhase('installing') // OS "Install?" sheet is now up
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          msg.includes(NEEDS_INSTALL_PERMISSION)
            ? 'Разрешите установку приложений из этого источника и нажмите «Обновить» снова'
            : msg,
        )
        setPhase('error')
      }
      return
    }

    // ── Windows: electron-updater ──
    setPhase('checking')
    try {
      await updateApi.setChannel({ channel })
      // Pass the release TAG the GitHub banner already resolved so the updater
      // checks that exact release folder → its verdict always agrees with the
      // banner. No silent browser hop when they'd otherwise disagree.
      const res = await updateApi.check({ tag: info.version })
      if (!res.hasUpdate) {
        // Updater genuinely sees nothing newer (already on latest, or the release
        // feed isn't ready yet). Don't yank the user into a browser — report an
        // honest state; they can retry.
        setError('Обновление недоступно — уже установлена последняя версия')
        setPhase('error')
        return
      }
      const offProgress = events.onUpdateProgress((p) => setProgress(Math.round(p.percent)))
      const offDownloaded = events.onUpdateDownloaded(() => setPhase('ready'))
      cleanupRef.current = () => { offProgress(); offDownloaded() }
      setPhase('downloading')
      await updateApi.download()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [info, channel])

  const restart = useCallback(async () => {
    setPhase('installing')
    try {
      await updateApi.install()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  return { phase, progress, error, start, restart }
}
