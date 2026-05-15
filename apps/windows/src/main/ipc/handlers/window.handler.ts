import { ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc/channels'
import { getMainWindow } from '../../window'

export function registerWindowHandlers(): void {
  ipcMain.handle(IpcChannel.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize()
  })

  ipcMain.handle(IpcChannel.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IpcChannel.WINDOW_CLOSE, () => {
    getMainWindow()?.close()
  })
}
