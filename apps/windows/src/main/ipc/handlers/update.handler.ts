import { z } from 'zod'
import { ipcMain } from 'electron'
import { handleIpc } from '../registry'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import { getUpdateService } from '../../services/UpdateService'
import { openExternalUrl } from '../../window'
import { parseGitHubReleasesAtom } from '../../../shared/update/parseGitHubReleasesAtom'

const UpdateChannelSchema = z.object({
  channel: z.enum(['stable', 'beta']),
})

export function registerUpdateHandlers(): void {
  handleIpc(IpcChannel.UPDATE_GET_STATUS, z.undefined().or(z.null()).or(z.object({})), async () => {
    return okResult(getUpdateService().getStatus())
  })

  handleIpc(IpcChannel.UPDATE_SET_CHANNEL, UpdateChannelSchema, async ({ channel }) => {
    getUpdateService().setChannel(channel)
    return okResult(undefined as void)
  })

  handleIpc(
    IpcChannel.UPDATE_CHECK,
    z.undefined().or(z.null()).or(z.object({ tag: z.string().optional() })),
    async (payload) => {
      try {
        const result = await getUpdateService().checkForUpdates(payload?.tag)
        return okResult(result)
      } catch (err) {
        return errResult('UPDATE_CHECK_FAILED', err instanceof Error ? err.message : String(err))
      }
    },
  )

  handleIpc(IpcChannel.UPDATE_DOWNLOAD, z.undefined().or(z.null()).or(z.object({})), async () => {
    try {
      await getUpdateService().downloadUpdate()
      return okResult(undefined as void)
    } catch (err) {
      return errResult('UPDATE_DOWNLOAD_FAILED', err instanceof Error ? err.message : String(err))
    }
  })

  // Fetch GitHub releases from the main process — the renderer's CSP
  // (`connect-src 'none'`) blocks the request, so the update banner's check must
  // proxy through here. Raw handle: returns the parsed array (or [] on any error)
  // to match the renderer-side bridge contract.
  //
  // We use the ATOM feed (github.com/…/releases.atom), NOT api.github.com. The
  // REST API is rate-limited to 60 req/hour PER IP; behind the shared VPN exit IP
  // that budget is exhausted collectively → 403 → the app silently showed «уже
  // актуальная» and never offered any update. The atom feed is served by
  // github.com and isn't subject to that limit.
  ipcMain.handle(IpcChannel.UPDATE_FETCH_RELEASES, async () => {
    try {
      const res = await fetch(
        'https://github.com/dmtrbtc/SlaveAppsVPN/releases.atom',
        { headers: { 'User-Agent': 'SlaveVPN-update' }, signal: AbortSignal.timeout(12_000) },
      )
      if (!res.ok) return []
      return parseGitHubReleasesAtom(await res.text())
    } catch {
      return []
    }
  })

  // Open an external URL (release download / page) in the system browser. The
  // renderer can't do this itself: window.open is denied by setWindowOpenHandler,
  // so the update banner's «Скачать» button needs the main process to call
  // shell.openExternal. Raw handle (fire-and-forget); openExternalUrl validates
  // the protocol (https only).
  ipcMain.handle(IpcChannel.UPDATE_OPEN_EXTERNAL, (_e, url: unknown) => {
    if (typeof url === 'string') openExternalUrl(url)
    return true
  })

  // INSTALL uses a raw ipcMain.handle because quitAndInstall is fire-and-forget
  ipcMain.handle(IpcChannel.UPDATE_INSTALL, () => {
    try {
      getUpdateService().quitAndInstall()
      return okResult(undefined as void)
    } catch (err) {
      return errResult('UPDATE_INSTALL_FAILED', err instanceof Error ? err.message : String(err))
    }
  })
}
