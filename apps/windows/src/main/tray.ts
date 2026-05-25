import { Tray, Menu, nativeImage, app, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { showMainWindow, getMainWindow } from './window'
import { getLogger } from './logger'
import type { VPNStatus, VPNMode } from '@slave-vpn/shared'

export interface TrayActions {
  connect: () => Promise<void> | void
  disconnect: () => Promise<void> | void
  setMode: (mode: VPNMode) => Promise<void> | void
  setProxy: (proxyName: string) => Promise<void> | void
  setBalancerEnabled: (enabled: boolean) => Promise<void> | void
}

interface TrayProxyEntry {
  name: string
  isAuto?: boolean
}

interface TrayState {
  status: VPNStatus['state']
  mode: VPNMode
  selectedProxy: string | null
  proxyList: TrayProxyEntry[]
  balancerEnabled: boolean
}

const MAX_TRAY_PROXIES = 12

const MODE_LABELS: Record<VPNMode, string> = {
  full: 'Полный VPN',
  bypass: 'Обход блокировок',
  split: 'Раздельный туннель',
  custom: 'Кастомный',
}

let tray: Tray | null = null
let actions: TrayActions | null = null
let state: TrayState = {
  status: 'disconnected',
  mode: 'bypass',
  selectedProxy: null,
  proxyList: [],
  balancerEnabled: false,
}

function safeRun<T>(label: string, fn: () => Promise<T> | T): void {
  try {
    const out = fn()
    if (out && typeof (out as Promise<T>).then === 'function') {
      (out as Promise<T>).catch((err: unknown) => {
        getLogger().warn({ err, label }, 'Tray action failed')
      })
    }
  } catch (err) {
    getLogger().warn({ err, label }, 'Tray action threw')
  }
}

export function createTray(): Tray {
  const log = getLogger()
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray', 'icon.png')
    : join(__dirname, '../../resources/icons/tray/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('SLAVE VPN')

  rebuild()

  // Single click → toggle window visibility (Windows convention)
  tray.on('click', () => {
    toggleMainWindow()
  })

  tray.on('double-click', () => {
    showMainWindow()
  })

  log.info('Tray created')
  return tray
}

export function setTrayActions(handlers: TrayActions): void {
  actions = handlers
  rebuild()
}

export function updateTrayStatus(status: VPNStatus['state']): void {
  if (state.status === status) return
  state = { ...state, status }
  applyTooltip()
  applyIcon()
  rebuild()
}

export function updateTrayMode(mode: VPNMode): void {
  if (state.mode === mode) return
  state = { ...state, mode }
  rebuild()
}

export function updateTraySelectedProxy(name: string | null): void {
  if (state.selectedProxy === name) return
  state = { ...state, selectedProxy: name }
  rebuild()
}

export function updateTrayProxyList(list: TrayProxyEntry[]): void {
  state = { ...state, proxyList: list }
  rebuild()
}

export function updateTrayBalancer(enabled: boolean): void {
  if (state.balancerEnabled === enabled) return
  state = { ...state, balancerEnabled: enabled }
  rebuild()
}

function toggleMainWindow(): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    showMainWindow()
    return
  }
  if (win.isVisible() && !win.isMinimized()) {
    win.hide()
  } else {
    showMainWindow()
  }
}

function applyTooltip(): void {
  if (!tray || tray.isDestroyed()) return
  const labels: Record<VPNStatus['state'], string> = {
    connected: 'SLAVE VPN — Подключено',
    disconnected: 'SLAVE VPN — Отключено',
    connecting: 'SLAVE VPN — Подключение...',
    disconnecting: 'SLAVE VPN — Отключение...',
    reconnecting: 'SLAVE VPN — Переподключение...',
    error: 'SLAVE VPN — Ошибка',
  }
  tray.setToolTip(labels[state.status] ?? 'SLAVE VPN')
}

function applyIcon(): void {
  if (!tray || tray.isDestroyed()) return
  const iconName = state.status === 'connected' ? 'icon-connected.png' : 'icon.png'
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray', iconName)
    : join(__dirname, '../../resources/icons/tray', iconName)
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) tray.setImage(icon)
}

function buildModeSubmenu(): MenuItemConstructorOptions[] {
  const modes: VPNMode[] = ['bypass', 'full', 'split', 'custom']
  return modes.map(m => ({
    label: MODE_LABELS[m],
    type: 'radio',
    checked: state.mode === m,
    click: () => {
      if (state.mode === m) return
      if (!actions) return
      safeRun('setMode', () => actions!.setMode(m))
    },
  }))
}

function buildProxySubmenu(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []

  items.push({
    label: 'Автовыбор (балансировщик)',
    type: 'radio',
    checked: state.balancerEnabled,
    click: () => {
      if (!actions) return
      safeRun('setBalancerEnabled', () => actions!.setBalancerEnabled(true))
    },
  })

  items.push({ type: 'separator' })

  if (state.proxyList.length === 0) {
    items.push({ label: 'Нет доступных серверов', enabled: false })
    return items
  }

  const top = state.proxyList.slice(0, MAX_TRAY_PROXIES)
  for (const p of top) {
    items.push({
      label: p.name.length > 38 ? p.name.slice(0, 35) + '…' : p.name,
      type: 'radio',
      checked: !state.balancerEnabled && state.selectedProxy === p.name,
      click: () => {
        if (!actions) return
        // selecting a specific proxy implicitly disables the balancer
        safeRun('setBalancerEnabled', () => actions!.setBalancerEnabled(false))
        safeRun('setProxy', () => actions!.setProxy(p.name))
      },
    })
  }

  if (state.proxyList.length > MAX_TRAY_PROXIES) {
    items.push({ type: 'separator' })
    items.push({ label: `... и ещё ${state.proxyList.length - MAX_TRAY_PROXIES}`, enabled: false })
  }

  return items
}

function statusLabel(): string {
  switch (state.status) {
    case 'connected':     return '● Подключено'
    case 'connecting':    return '◐ Подключение...'
    case 'reconnecting':  return '◐ Переподключение...'
    case 'disconnecting': return '◐ Отключение...'
    case 'error':         return '⚠ Ошибка'
    case 'disconnected':
    default:              return '○ Отключено'
  }
}

function rebuild(): void {
  if (!tray || tray.isDestroyed()) return

  const isConnected = state.status === 'connected'
  const isBusy = state.status === 'connecting' || state.status === 'disconnecting' || state.status === 'reconnecting'
  const canToggle = !isBusy && actions !== null

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Открыть SLAVE VPN',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: statusLabel(),
      enabled: false,
    },
    {
      label: isConnected ? 'Отключить' : 'Подключить',
      enabled: canToggle,
      click: () => {
        if (!actions) {
          showMainWindow()
          return
        }
        if (isConnected) safeRun('disconnect', () => actions!.disconnect())
        else safeRun('connect', () => actions!.connect())
      },
    },
    { type: 'separator' },
    {
      label: `Режим: ${MODE_LABELS[state.mode]}`,
      submenu: buildModeSubmenu(),
    },
    {
      label: 'Сервер',
      submenu: buildProxySubmenu(),
    },
    { type: 'separator' },
    {
      label: 'Настройки',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => app.quit(),
    },
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
    tray = null
  }
}
