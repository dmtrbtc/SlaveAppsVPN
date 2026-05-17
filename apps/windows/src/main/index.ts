import { app, powerMonitor } from 'electron'
import { join } from 'path'
import { initLogger, getLogger, setCrashLogPath, writeCrashLog } from './logger'
import { createMainWindow, showMainWindow } from './window'
import { createTray, destroyTray } from './tray'
import { registerAllHandlers } from './ipc/registry'
import { getSettingsStore } from './services/SettingsStore'
import { bootstrap, shutdownBootstrap, triggerReconnect } from './bootstrap'
import { autoUpdater } from 'electron-updater'
import { sendToRenderer } from './window'
import { IpcChannel } from '../shared/ipc/channels'

// ─── Security: enforce before app ready ───────────────────────────────────────
app.commandLine.appendSwitch('disable-http-cache')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ─── Crash safety ─────────────────────────────────────────────────────────────

process.on('uncaughtException', (error: Error) => {
  writeCrashLog('uncaughtException', error)
  try {
    getLogger().fatal({ err: error }, 'Uncaught exception')
  } catch {
    process.stderr.write(`[FATAL] Uncaught exception: ${error.stack ?? error.message}\n`)
  }
})

process.on('unhandledRejection', (reason: unknown) => {
  writeCrashLog('unhandledRejection', reason)
  try {
    getLogger().error({ reason }, 'Unhandled promise rejection')
  } catch {
    process.stderr.write(`[ERROR] Unhandled rejection: ${String(reason)}\n`)
  }
})

// ─── Initialization ───────────────────────────────────────────────────────────

initLogger()

const log = getLogger()

log.info({ version: app.getVersion(), platform: process.platform }, 'SLAVE VPN starting')

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  const logger = initLogger(userDataPath)
  setCrashLogPath(userDataPath)

  logger.info({ phase: 'app_ready', version: app.getVersion(), pid: process.pid }, 'App ready')

  logger.debug({ phase: 'ipc_register' }, 'Registering IPC handlers')
  registerAllHandlers()
  logger.debug({ phase: 'ipc_register' }, 'IPC handlers registered')

  logger.debug({ phase: 'window_create' }, 'Creating main window')
  createMainWindow()
  createTray()
  logger.debug({ phase: 'window_create' }, 'Main window created')

  setupAutoStart()
  setupAutoUpdater()
  setupPowerMonitor()

  logger.info({ phase: 'bootstrap_start' }, 'Starting provider bootstrap')
  bootstrap()
    .then(() => logger.info({ phase: 'bootstrap_complete' }, 'Bootstrap complete'))
    .catch((err: unknown) => {
      writeCrashLog('bootstrap_failed', err)
      log.error({ err, phase: 'bootstrap_failed' }, 'Bootstrap failed — app running in degraded mode')
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
    log.info('System resumed — reconnecting VPN if active')
    triggerReconnect().catch((err: unknown) => {
      log.error({ err }, 'Failed to reconnect VPN after system resume')
    })
  })

  powerMonitor.on('lock-screen', () => {
    log.debug('Screen locked')
  })

  powerMonitor.on('unlock-screen', () => {
    log.debug('Screen unlocked')
  })
}
