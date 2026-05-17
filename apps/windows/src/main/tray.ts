import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { showMainWindow } from './window'
import { getLogger } from './logger'
import type { VPNStatus } from '@slave-vpn/shared'

let tray: Tray | null = null
let currentStatus: VPNStatus['state'] = 'disconnected'

export function createTray(): Tray {
  const log = getLogger()
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray', 'icon.png')
    : join(__dirname, '../../resources/icons/tray/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('SLAVE VPN')

  updateTrayMenu()

  tray.on('click', () => {
    showMainWindow()
  })

  tray.on('double-click', () => {
    showMainWindow()
  })

  log.info('Tray created')
  return tray
}

export function updateTrayStatus(state: VPNStatus['state']): void {
  if (!tray || tray.isDestroyed()) return

  currentStatus = state
  updateTrayTooltip()
  updateTrayMenu()
  updateTrayIcon()
}

function updateTrayTooltip(): void {
  if (!tray || tray.isDestroyed()) return

  const statusLabels: Record<VPNStatus['state'], string> = {
    connected: 'SLAVE VPN — Подключено',
    disconnected: 'SLAVE VPN — Отключено',
    connecting: 'SLAVE VPN — Подключение...',
    disconnecting: 'SLAVE VPN — Отключение...',
    reconnecting: 'SLAVE VPN — Переподключение...',
    error: 'SLAVE VPN — Ошибка',
  }

  tray.setToolTip(statusLabels[currentStatus] ?? 'SLAVE VPN')
}

function updateTrayIcon(): void {
  if (!tray || tray.isDestroyed()) return

  const iconName =
    currentStatus === 'connected' ? 'icon-connected.png' : 'icon.png'
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray', iconName)
    : join(__dirname, '../../resources/icons/tray', iconName)
  const icon = nativeImage.createFromPath(iconPath)

  if (!icon.isEmpty()) {
    tray.setImage(icon)
  }
}

function updateTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return

  const isConnected = currentStatus === 'connected'
  const isBusy = currentStatus === 'connecting' || currentStatus === 'disconnecting'

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть SLAVE VPN',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: isConnected ? '● Подключено' : '○ Отключено',
      enabled: false,
    },
    {
      label: isConnected ? 'Отключить' : 'Подключить',
      enabled: !isBusy,
      click: () => {
        showMainWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Настройки',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Выйти',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
    tray = null
  }
}
