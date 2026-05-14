import { BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getLogger } from './logger'

const WINDOW_MIN_WIDTH = 380
const WINDOW_MIN_HEIGHT = 600
const WINDOW_DEFAULT_WIDTH = 420
const WINDOW_DEFAULT_HEIGHT = 700

let mainWindow: BrowserWindow | null = null

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
    icon: join(__dirname, '../../resources/icons/icon.png'),
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

  mainWindow.on('ready-to-show', () => {
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
          "connect-src 'none'",
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
