import { IpcChannel } from '../../../shared/ipc/channels'
import { EmptySchema, ConfigSourceSetSchema, ConfigSourceValidateSchema } from '../../../shared/ipc/schemas'
import { errResult, okResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getConfigSourceService } from '../../services/impl/ConfigSourceService'
import { updateRuntimeConfigSource } from '../../bootstrap'

export function registerConfigSourceHandlers(): void {
  handleIpc(IpcChannel.CONFIG_SOURCE_GET_META, EmptySchema, async () => {
    const meta = getConfigSourceService().getMeta()
    return okResult(meta)
  })

  handleIpc(IpcChannel.CONFIG_SOURCE_VALIDATE, ConfigSourceValidateSchema, async (data) => {
    const result = await getConfigSourceService().validate(data.type, data.input)
    return okResult(result)
  })

  handleIpc(IpcChannel.CONFIG_SOURCE_SET, ConfigSourceSetSchema, async (data) => {
    try {
      const meta = await getConfigSourceService().set(data.type, data.input)
      updateRuntimeConfigSource()
      return okResult(meta)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return errResult('INVALID_INPUT', message)
    }
  })

  handleIpc(IpcChannel.CONFIG_SOURCE_CLEAR, EmptySchema, async () => {
    getConfigSourceService().clear()
    return okResult(undefined)
  })
}
