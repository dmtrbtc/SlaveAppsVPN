import { app, powerMonitor } from 'electron'
import { join } from 'path'
import { initLogger, getLogger } from './logger'
import { createMainWindow, getMainWindow, showMainWindow } from './window'
import { createTray, destroyTray, updateTrayStatus } from './tray'
import { registerAllHandlers } from './ipc/registry'
import { getSettingsStore } from './services/SettingsStore'
import { bootstrap, shutdownBootstrap } from './bootstrap'
import { autoUpdater } from 'electron-updater'
import { sendToRenderer } from './window'
import { IpcChannel } from '../shared/ipc/channels'

// ─── Security: enforce before app ready ───────────────────────────────────────
// Disable remote module (redundant in modern Electron but kept for clarity)
app.commandLine.appendSwitch('disable-http-cache')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ─── Initialization ───────────────────────────────────────────────────────────

initLogger()

const log = getLogger()

log.info({ version: app.getVersion(), platform: process.platform }, 'SLAVE VPN starting')

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const logger = initLogger(app.getPath('userData'))
  logger.info('App ready')

  registerAllHandlers()

  createMainWindow()
  createTray()

  setupAutoStart()
  setupAutoUpdater()
  setupPowerMonitor()

  bootstrap().catch((err: unknown) => {
    log.error({ err }, 'Bootstrap failed — app will run in degraded mode')
  })

  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('activate', () => {
    showMainWindow()
  })

  log.info('Initialization complete')
}).catch((error: unknown) => {
  log.fatal({ error }, 'Fatal error during app initialization')
  app.quit()
})

app.on('window-all-closed', () => {
  const settings = getSettingsStore()
  if (!settings.get('minimizeToTray')) {
    app.quit()
  }
})

let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  log.info('App shutting down — stopping VPN engine')
  destroyTray()
  shutdownBootstrap().finally(() => {
    log.info('Shutdown complete')
    app.exit(0)
  })
})

app.on('will-quit', () => {
  log.info('App will quit')
})

// ─── Auto-start ───────────────────────────────────────────────────────────────

function setupAutoStart(): void {
  const settings = getSettingsStore()
  const autoStart = settings.get('autoStart')

  app.setLoginItemSettings({
    openAtLogin: autoStart,
    openAsHidden: true,
    path: app.isPackaged ? app.getPath('exe') : process.execPath,
    args: app.isPackaged ? [] : [join(__dirname, '..', '..', 'node_modules', '.bin', 'electron-vite'), '.'],
  })
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    log.debug('Auto-updater disabled in development')
    return
  }

  autoUpdater.logger = {
    info: (msg) => log.info({ src: 'updater' }, String(msg)),
    warn: (msg) => log.warn({ src: 'updater' }, String(msg)),
    error: (msg) => log.error({ src: 'updater' }, String(msg)),
    debug: (msg) => log.debug({ src: 'updater' }, String(msg)),
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    log.info({ version: info.version }, 'Update available')
    sendToRenderer(IpcChannel.EVENT_UPDATE_AVAILABLE, {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info({ version: info.version }, 'Update downloaded')
    sendToRenderer(IpcChannel.EVENT_UPDATE_DOWNLOADED, {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('error', (error: Error) => {
    log.error({ error }, 'Auto-updater error')
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    log.warn({ err }, 'Update check failed')
  })
}

// ─── Power events ─────────────────────────────────────────────────────────────

function setupPowerMonitor(): void {
  powerMonitor.on('suspend', () => {
    log.info('System suspending')
  })

  powerMonitor.on('resume', () => {
    log.info('System resumed — checking VPN connection')
    updateTrayStatus('reconnecting')
  })

  powerMonitor.on('lock-screen', () => {
    log.debug('Screen locked')
  })

  powerMonitor.on('unlock-screen', () => {
    log.debug('Screen unlocked')
    const window = getMainWindow()
    if (!window) return
    sendToRenderer(IpcChannel.EVENT_VPN_STATUS, { state: 'reconnecting' })
  })
}
