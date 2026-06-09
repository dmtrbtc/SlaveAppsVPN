import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getLogger } from './logger'

const WINDOW_MIN_WIDTH = 380
const WINDOW_MIN_HEIGHT = 600
const WINDOW_DEFAULT_WIDTH = 420
const WINDOW_DEFAULT_HEIGHT = 700
const READY_TO_SHOW_TIMEOUT_MS = 15_000

let mainWindow: BrowserWindow | null = null
let renderCrashCount = 0
let showTimer: ReturnType<typeof setTimeout> | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  const log = getLogger()

  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    resizable: true,
    maximizable: false,
    center: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f14',
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icons', 'icon.png')
      : join(__dirname, '../../resources/icons/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
    },
  })

  applyContentSecurityPolicy()

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    const isLocalDev = is.dev && parsedUrl.hostname === 'localhost'
    if (!isLocalDev) {
      event.preventDefault()
      log.warn({ url }, 'Blocked navigation attempt')
    }
  })

  mainWindow.webContents.on('will-redirect', (event, url) => {
    event.preventDefault()
    log.warn({ url }, 'Blocked redirect attempt')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log.info({ phase: 'renderer_loaded' }, 'Renderer did-finish-load')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errCode, errDesc, validatedURL) => {
    log.error({ errCode, errDesc, url: validatedURL }, 'Renderer did-fail-load')
    // Force show so the user sees something instead of an invisible hung process
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const src = sourceId ? sourceId.split('/').pop() : 'renderer'
    if (level === 3) log.error({ line, src }, `[renderer] ${message}`)
    else if (level === 2) log.warn({ line, src }, `[renderer] ${message}`)
    else log.debug({ line, src }, `[renderer] ${message}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error({ reason: details.reason, exitCode: details.exitCode }, 'Renderer process gone')
    renderCrashCount++
    if (renderCrashCount <= 3 && mainWindow && !mainWindow.webContents.isDestroyed()) {
      log.info({ attempt: renderCrashCount }, 'Reloading renderer after crash')
      if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
      } else {
        void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
      }
    } else {
      log.error({ renderCrashCount }, 'Renderer crashed too many times — not reloading')
      // Show window anyway so the user sees *something* rather than a ghost process
      if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
    }
  })

  mainWindow.on('unresponsive', () => {
    log.warn('Window unresponsive')
  })

  mainWindow.on('responsive', () => {
    log.info('Window responsive again')
  })

  // Fallback: if ready-to-show hasn't fired after READY_TO_SHOW_TIMEOUT_MS, force-show.
  // Covers renderer crash-before-paint, preload failure, or any other invisible-window scenario.
  showTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      log.error({ phase: 'force_show', timeoutMs: READY_TO_SHOW_TIMEOUT_MS },
        'ready-to-show timeout — force-showing window for diagnostics')
      mainWindow.show()
    }
  }, READY_TO_SHOW_TIMEOUT_MS)

  mainWindow.once('ready-to-show', () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null }
    log.info({ phase: 'ready_to_show' }, 'Window ready-to-show')
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log.info('Main window created')
  return mainWindow
}

function applyContentSecurityPolicy(): void {
  const isDev = is.dev

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' ws://localhost:* http://localhost:*",
          "worker-src 'none'",
          "object-src 'none'",
        ].join('; ')
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          // api.github.com is allowed ONLY for the in-app update check (release
          // list). The check normally proxies through the main process, but we
          // also permit a direct renderer fetch as a fallback so the update
          // banner works regardless of bridge timing. No other remote origin.
          "connect-src 'self' https://api.github.com",
          "worker-src 'none'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    })
  })
}

export function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function openExternalUrl(url: string): void {
  const allowedProtocols = ['https:', 'tg:']
  try {
    const parsed = new URL(url)
    if (allowedProtocols.includes(parsed.protocol)) {
      void shell.openExternal(url)
    } else {
      getLogger().warn({ url }, 'Blocked external URL with disallowed protocol')
    }
  } catch {
    getLogger().warn({ url }, 'Blocked malformed external URL')
  }
}
