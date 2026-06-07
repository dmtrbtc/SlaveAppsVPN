import { app, powerMonitor } from 'electron'
import { join } from 'path'
import { initLogger, getLogger, setCrashLogPath, writeCrashLog } from './logger'
import { createMainWindow, showMainWindow } from './window'
import { createTray, destroyTray } from './tray'
import { registerAllHandlers } from './ipc/registry'
import { getSettingsStore } from './services/SettingsStore'
import { bootstrap, shutdownBootstrap, triggerReconnect } from './bootstrap'
import { getUpdateService } from './services/UpdateService'
import { getSafeModeManager } from './services/SafeModeManager'
import { startupTracker } from './startup-tracker'

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

// PHASE 0: Pre-ready bootstrap logger (no userData path yet).
// Must use synchronous stdout in production — pino-pretty is a devDependency
// and its absence in packaged builds causes ThreadStream to deadlock via Atomics.wait().
initLogger()

// Safe mode must be initialized before bootstrap — reads crash loop counter
getSafeModeManager().init()

const log = getLogger()

const isSafeModeFlag = process.argv.includes('--safe-mode')

log.info({
  version: app.getVersion(),
  commit: __APP_COMMIT__,
  buildTime: __BUILD_TIMESTAMP__,
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  node: process.versions.node,
  env: app.isPackaged ? 'packaged' : 'dev',
  safeMode: isSafeModeFlag || getSafeModeManager().isSafeMode(),
  pid: process.pid,
}, 'SLAVE VPN starting')

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData')
  // PHASE 1: Replace pre-ready stdout logger with persistent file logger
  const logger = initLogger(userDataPath)
  setCrashLogPath(userDataPath)

  startupTracker.begin('app_ready', 'App ready')
  logger.info({ phase: 'app_ready', version: app.getVersion(), pid: process.pid, safeMode: isSafeModeFlag }, 'App ready')
  startupTracker.complete('app_ready')

  // PHASE 2: Register IPC handlers (dynamic imports of handler chunks)
  startupTracker.begin('ipc_register', 'Register IPC handlers')
  logger.info({ phase: 'ipc_register_start' }, 'Registering IPC handlers')
  await registerAllHandlers()
  startupTracker.complete('ipc_register')
  logger.info({ phase: 'ipc_register_done' }, 'IPC handlers registered')

  // PHASE 3: Create window — must happen before bootstrap so UI is visible during startup
  startupTracker.begin('window_create', 'Create main window')
  logger.info({ phase: 'window_create_start' }, 'Creating main window')
  createMainWindow()
  createTray()
  startupTracker.complete('window_create')
  logger.info({ phase: 'window_create_done' }, 'Main window created')

  setupAutoStart()
  setupAutoUpdater()
  setupPowerMonitor()

  // PHASE 4: Provider/runtime bootstrap (fire-and-forget, degraded mode on failure)
  startupTracker.begin('bootstrap', 'Provider & runtime bootstrap')
  logger.info({ phase: 'bootstrap_start', safeMode: isSafeModeFlag }, 'Starting provider bootstrap')
  bootstrap(isSafeModeFlag)
    .then(() => {
      startupTracker.complete('bootstrap')
      startupTracker.markComplete()
      logger.info({ phase: 'bootstrap_complete' }, 'Bootstrap complete')
    })
    .catch((err: unknown) => {
      startupTracker.fail('bootstrap', err instanceof Error ? err.message : String(err))
      writeCrashLog('bootstrap_failed', err)
      logger.error({ err, phase: 'bootstrap_failed' }, 'Bootstrap failed — app running in degraded mode')
    })

  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('activate', () => {
    showMainWindow()
  })

  logger.info({ phase: 'init_complete' }, 'Initialization complete')
}).catch((error: unknown) => {
  writeCrashLog('app_init_failed', error)
  log.fatal({ error }, 'Fatal error during app initialization')
  // Force show window even during fatal init failure so user sees error state
  try {
    const { getMainWindow } = require('./window') as typeof import('./window')
    const w = getMainWindow()
    if (w && !w.isVisible()) w.show()
  } catch { /* ignore */ }
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
  getUpdateService().setup()
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
