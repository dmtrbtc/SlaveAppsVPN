import { z } from 'zod'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { getRoutingScenarioService } from '../../services/RoutingScenarioService'

const SetEnabledSchema = z.object({
  scenarioIds: z.array(z.string()),
})

export function registerRoutingHandlers(): void {
  handleIpc(IpcChannel.ROUTING_LIST_SCENARIOS, EmptySchema, async () => {
    try {
      return okResult(getRoutingScenarioService().list())
    } catch (err) {
      return errResult('ROUTING_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.ROUTING_SET_ENABLED_SCENARIOS, SetEnabledSchema, async (payload) => {
    try {
      const updated = getRoutingScenarioService().setEnabled(payload.scenarioIds)
      return okResult(updated)
    } catch (err) {
      return errResult('ROUTING_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
