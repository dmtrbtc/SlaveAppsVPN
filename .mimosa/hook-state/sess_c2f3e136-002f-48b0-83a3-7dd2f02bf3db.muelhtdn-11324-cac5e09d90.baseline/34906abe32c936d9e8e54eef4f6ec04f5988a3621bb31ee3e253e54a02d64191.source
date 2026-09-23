import { z } from 'zod'
import { handleIpc } from '../registry'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult } from '../../../shared/ipc/types'
import { getSafeModeManager } from '../../services/SafeModeManager'

export function registerSafeModeHandlers(): void {
  handleIpc(IpcChannel.SAFE_MODE_GET_STATUS, z.undefined().or(z.null()).or(z.object({})), async () => {
    const mgr = getSafeModeManager()
    return okResult({ active: mgr.isSafeMode(), launchCount: mgr.getLaunchCount() })
  })

  handleIpc(IpcChannel.SAFE_MODE_RESET, z.undefined().or(z.null()).or(z.object({})), async () => {
    getSafeModeManager().resetSafeMode()
    return okResult(undefined as void)
  })
}
