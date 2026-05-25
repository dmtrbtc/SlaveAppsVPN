import { IpcChannel } from '../../../shared/ipc/channels'
import { z } from 'zod'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc } from '../registry'
import { getRuleProviderService } from '../../services/RuleProviderService'
import { EmptySchema } from '../../../shared/ipc/schemas'
const RuleProviderAddSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['domain-list', 'ip-cidr-list', 'clash-yaml', 'geosite', 'geoip', 'mixed']),
  action: z.enum(['proxy', 'direct', 'reject']),
  category: z.string().optional(),
})
const RuleProviderRemoveSchema = z.object({ id: z.string() })
const RuleProviderUpdateSchema = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
  action: z.enum(['proxy', 'direct', 'reject']).optional(),
  priority: z.number().optional(),
})
const RuleProviderReorderSchema = z.object({ ids: z.array(z.string()) })

export function registerRulesHandlers(): void {
  handleIpc(IpcChannel.RULES_LIST, EmptySchema, async () => {
    return okResult(getRuleProviderService().list())
  })

  handleIpc(IpcChannel.RULES_ADD, RuleProviderAddSchema, async (payload) => {
    try {
      const provider = getRuleProviderService().add({
        name: payload.name,
        url: payload.url,
        type: payload.type,
        action: payload.action,
        ...(payload.category !== undefined ? { category: payload.category } : {}),
      })
      return okResult(provider)
    } catch (err) {
      return errResult('RULES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.RULES_REMOVE, RuleProviderRemoveSchema, async ({ id }) => {
    try {
      getRuleProviderService().remove(id)
      return okResult(undefined)
    } catch (err) {
      return errResult('RULES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.RULES_UPDATE, RuleProviderUpdateSchema, async (payload) => {
    try {
      const patch: Parameters<ReturnType<typeof getRuleProviderService>['update']>[1] = {}
      if (payload.enabled !== undefined) patch.enabled = payload.enabled
      if (payload.action !== undefined) patch.action = payload.action
      if (payload.priority !== undefined) patch.priority = payload.priority
      const updated = getRuleProviderService().update(payload.id, patch)
      return okResult(updated)
    } catch (err) {
      return errResult('RULES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.RULES_REORDER, RuleProviderReorderSchema, async ({ ids }) => {
    try {
      getRuleProviderService().reorder(ids)
      return okResult(undefined)
    } catch (err) {
      return errResult('RULES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.RULES_RELOAD, EmptySchema, async () => {
    try {
      await getRuleProviderService().reload()
      return okResult(undefined)
    } catch (err) {
      return errResult('RULES_RELOAD_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
