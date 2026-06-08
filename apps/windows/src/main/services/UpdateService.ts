import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateChannel, UpdateState, UpdateStatus, UpdateProgressPayload } from '../../shared/ipc/types'
import { IpcChannel } from '../../shared/ipc/channels'
import { sendToRenderer } from '../window'
import { getLogger } from '../logger'
import { getSettingsStore } from './SettingsStore'

export class UpdateService {
  private state: UpdateState = 'idle'
  private availableVersion: string | null = null
  private downloadProgress = 0
  private error: string | null = null
  private releaseNotes: string | null = null
  private checkedAt: number | null = null
  private channel: UpdateChannel = 'stable'

  setup(): void {
    if (!app.isPackaged) {
      getLogger().debug('UpdateService: skipped in dev mode')
      return
    }

    // Restore channel preference
    try {
      const stored = getSettingsStore().get('updateChannel')
      if (stored === 'beta' || stored === 'stable') {
        this.channel = stored
      }
    } catch { /* ignore — settings not yet initialized */ }

    this.applyChannel()

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.logger = {
      info:  (msg) => getLogger().info({ src: 'updater' }, String(msg)),
      warn:  (msg) => getLogger().warn({ src: 'updater' }, String(msg)),
      error: (msg) => getLogger().error({ src: 'updater' }, String(msg)),
      debug: (msg) => getLogger().debug({ src: 'updater' }, String(msg)),
    }

    autoUpdater.on('checking-for-update', () => {
      this.state = 'checking'
      this.error = null
    })

    autoUpdater.on('update-available', (info) => {
      this.state = 'available'
      this.availableVersion = info.version
      this.releaseNotes = typeof info.releaseNotes === 'string' ? info.releaseNotes : null
      this.checkedAt = Date.now()
      sendToRenderer(IpcChannel.EVENT_UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: this.releaseNotes,
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.state = 'not-available'
      this.checkedAt = Date.now()
      this.availableVersion = null
    })

    autoUpdater.on('download-progress', (progress) => {
      this.downloadProgress = Math.round(progress.percent)
      const payload: UpdateProgressPayload = {
        percent: this.downloadProgress,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      }
      sendToRenderer(IpcChannel.EVENT_UPDATE_PROGRESS, payload)
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.state = 'ready'
      this.downloadProgress = 100
      this.availableVersion = info.version
      sendToRenderer(IpcChannel.EVENT_UPDATE_DOWNLOADED, {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      })
    })

    autoUpdater.on('error', (error: Error) => {
      this.state = 'error'
      this.error = error.message
      getLogger().error({ err: error }, 'Auto-updater error')
    })

    // No startup auto-check: the renderer now checks updates via the GitHub
    // Releases API (unified with Android, and free of the electron-updater
    // pitfalls — prerelease channels / latest.yml resolving to the wrong tag /
    // the app version not bumping between alphas). electron-updater remains
    // available for an explicit in-app download/install if wired later.
  }

  async checkForUpdates(): Promise<{ hasUpdate: boolean; version: string | null }> {
    if (!app.isPackaged) {
      return { hasUpdate: false, version: null }
    }
    this.state = 'checking'
    this.error = null
    try {
      const result = await autoUpdater.checkForUpdates()
      const hasUpdate = result !== null && result.updateInfo.version !== app.getVersion()
      return {
        hasUpdate,
        version: hasUpdate ? result!.updateInfo.version : null,
      }
    } catch (err) {
      this.state = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) return
    if (this.state !== 'available') {
      throw new Error('No update available to download')
    }
    this.state = 'downloading'
    this.downloadProgress = 0
    await autoUpdater.downloadUpdate()
  }

  quitAndInstall(): void {
    if (this.state !== 'ready') {
      throw new Error('Update not ready — download it first')
    }
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
  }

  setChannel(channel: UpdateChannel): void {
    this.channel = channel
    this.applyChannel()
    try {
      getSettingsStore().patch({ updateChannel: channel })
    } catch { /* ignore */ }
  }

  getStatus(): UpdateStatus {
    return {
      state: this.state,
      channel: this.channel,
      currentVersion: app.getVersion(),
      availableVersion: this.availableVersion,
      downloadProgress: this.downloadProgress,
      error: this.error,
      releaseNotes: this.releaseNotes,
      checkedAt: this.checkedAt,
    }
  }

  private applyChannel(): void {
    autoUpdater.allowPrerelease = this.channel === 'beta'
    autoUpdater.channel = this.channel === 'beta' ? 'beta' : 'latest'
  }
}

let instance: UpdateService | null = null

export function getUpdateService(): UpdateService {
  if (!instance) instance = new UpdateService()
  return instance
}
