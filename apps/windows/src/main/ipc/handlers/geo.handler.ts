import { z } from 'zod'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { getGeoUpdaterService } from '../../services/GeoUpdaterService'

const UpdateOneSchema = z.object({ id: z.string().min(1) })

export function registerGeoHandlers(): void {
  const svc = getGeoUpdaterService()

  handleIpc(IpcChannel.GEO_GET_STATE, EmptySchema, async () => {
    return okResult(svc.getState())
  })

  handleIpc(IpcChannel.GEO_LIST_SOURCES, EmptySchema, async () => {
    const sources = svc.listSources().map(s => ({
      id: s.id,
      label: s.label,
      url: s.url,
      filename: s.filename,
      category: s.category,
    }))
    return okResult(sources)
  })

  handleIpc(IpcChannel.GEO_UPDATE_ALL, EmptySchema, async () => {
    try {
      const results = await svc.updateAll()
      return okResult(results)
    } catch (err) {
      return errResult('GEO_UPDATE_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.GEO_UPDATE_ONE, UpdateOneSchema, async ({ id }) => {
    try {
      const result = await svc.updateOne(id)
      return okResult(result)
    } catch (err) {
      return errResult('GEO_UPDATE_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
