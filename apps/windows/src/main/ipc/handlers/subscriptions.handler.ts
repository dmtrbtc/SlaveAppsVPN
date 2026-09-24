import { z } from 'zod'
import { clipboard } from 'electron'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import type {
  ConfigSourceType,
  ClipboardDetectResult,
  SubscriptionAutoUpdate,
} from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import type { RuntimeService } from '../../services/RuntimeService'
import type { ConfigUpdateReason } from '../../services/impl/RuntimeServiceImpl'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { getSubscriptionStore } from '../../services/SubscriptionStore'
import { getConfigSourceService } from '../../services/impl/ConfigSourceService'
import { getSubscriptionAggregator } from '../../services/SubscriptionAggregatorService'
import { getSubscriptionScheduler } from '../../services/SubscriptionScheduler'
import { parseProxyLink } from '../../services/impl/sources/SingleProxySource'
import { isProxyUri, normalizeProxyUriInput } from '@slave-vpn/config'
import { getLogger } from '../../logger'
import { sendToRenderer } from '../../window'

const ConfigSourceTypeSchema = z.enum(['provider', 'subscription-url', 'single-proxy', 'remnawave-key'])
const AutoUpdateSchema = z.union([z.literal(0), z.literal(15), z.literal(60), z.literal(360), z.literal(1440)])

const AddSchema = z.object({
  name: z.string().optional(),
  type: ConfigSourceTypeSchema,
  input: z.string().min(1).max(8192),
  autoUpdateMinutes: AutoUpdateSchema.optional(),
})

const RemoveSchema = z.object({ id: z.string().min(1) })
const ReorderSchema = z.object({ ids: z.array(z.string().min(1)).max(1000) })

const UpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  autoUpdateMinutes: AutoUpdateSchema.optional(),
})

const RefreshSchema = z.object({ id: z.string().min(1) })

// VPN URI schemes the clipboard detector recognises.
const VPN_URI_PATTERN = /\b(vless|vmess|trojan|ss|hysteria2?|tuic|wireguard|wg)(?:\\)?:\/\/[^\s]+/i

function detectClipboardLink(text: string): ClipboardDetectResult {
  const match = text.match(VPN_URI_PATTERN)
  if (!match) return { found: false }

  const uri = normalizeProxyUriInput(match[0])
  const scheme = (match[1] ?? '').toLowerCase()

  try {
    const parsed = parseProxyLink(uri)
    return {
      found: true,
      scheme,
      input: uri,
      preview: {
        name: parsed.name,
        protocol: parsed.type,
        transport: parsed.transport ?? 'tcp',
        security: parsed.securityType ?? 'none',
      },
    }
  } catch {
    // URI matched the pattern but parser rejected — still surface it
    return { found: true, scheme, input: uri }
  }
}

export function registerSubscriptionsHandlers(): void {
  const store = getSubscriptionStore()
  const configSourceService = getConfigSourceService()
  const aggregator = getSubscriptionAggregator()
  const scheduler = getSubscriptionScheduler()
  const log = getLogger()

  // Fire a hot-reload on the engine if connected. Safe to call frequently;
  // RuntimeServiceImpl no-ops when state !== 'running'.
  const triggerHotReload = async (reason: ConfigUpdateReason): Promise<void> => {
    try {
      if (!services.has('runtime')) return
      const runtime = services.resolve<RuntimeService>('runtime')
      await runtime.notifySubscriptionsChanged(reason)
    } catch (err) {
      log.warn({ err }, 'Cannot trigger subscription hot-reload')
    }
  }

  handleIpc(IpcChannel.SUBSCRIPTIONS_LIST, EmptySchema, async () => {
    return okResult(store.list())
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_ADD, AddSchema, async (payload) => {
    try {
      const input = normalizeProxyUriInput(payload.input)
      const requestedType = payload.type as ConfigSourceType
      const type: ConfigSourceType =
        (requestedType === 'subscription-url' || requestedType === 'single-proxy') && isProxyUri(input)
          ? 'single-proxy'
          : requestedType
      if (type === 'provider') {
        return errResult('SUBSCRIPTIONS_ERROR', 'Provider type cannot be added manually')
      }
      const validation = await configSourceService.validate(type, input)
      if (!validation.valid) {
        return errResult('SUBSCRIPTIONS_INVALID', validation.error ?? 'Validation failed')
      }

      const outcome = store.add({
        type,
        rawInput: input,
        ...(payload.name ? { name: payload.name } : {}),
        ...(validation.displayName ? { displayName: validation.displayName } : {}),
        ...(validation.nodeCount !== undefined ? { nodeCount: validation.nodeCount } : {}),
        autoUpdateMinutes: (payload.autoUpdateMinutes ?? 60) as SubscriptionAutoUpdate,
      })

      if (outcome.created) {
        aggregator.invalidateSnapshot()
        scheduler.reconcile()
        await triggerHotReload('subscription-added')
        sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, store.list())
        log.info({ id: outcome.entry.id, type }, 'Subscription added')
      }
      return okResult(outcome)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_REMOVE, RemoveSchema, async ({ id }) => {
    try {
      store.remove(id)
      aggregator.invalidate(id)
      scheduler.reconcile()
      await triggerHotReload('subscription-removed')
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, store.list())
      log.info({ id }, 'Subscription removed')
      return okResult(undefined)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_REORDER, ReorderSchema, async ({ ids }) => {
    try {
      const list = store.reorder(ids)
      aggregator.invalidateSnapshot()
      await triggerHotReload('subscription-reordered')
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, list)
      return okResult(list)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_UPDATE, UpdateSchema, async (payload) => {
    try {
      const patch: Parameters<typeof store.update>[1] = {}
      if (payload.name !== undefined) patch.name = payload.name
      if (payload.enabled !== undefined) patch.enabled = payload.enabled
      if (payload.autoUpdateMinutes !== undefined) {
        patch.autoUpdateMinutes = payload.autoUpdateMinutes as SubscriptionAutoUpdate
      }
      const updated = store.update(payload.id, patch)
      scheduler.reconcile()
      // enabled flag affects which entries the aggregator sees → hot-reload
      if (payload.enabled !== undefined) {
        aggregator.invalidateSnapshot()
        await triggerHotReload('subscription-enabled-change')
      }
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, store.list())
      return okResult(updated)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_REFRESH, RefreshSchema, async ({ id }) => {
    try {
      const updated = await aggregator.refreshOne(id)
      if (!updated) return errResult('SUBSCRIPTIONS_NOT_FOUND', `Subscription not found: ${id}`)
      await triggerHotReload('manual-subscription-refresh')
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, store.list())
      return okResult(updated)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_REFRESH_ALL, EmptySchema, async () => {
    try {
      const list = await aggregator.refreshAll()
      await triggerHotReload('manual-subscription-refresh')
      sendToRenderer(IpcChannel.EVENT_SUBSCRIPTIONS_CHANGED, list)
      return okResult(list)
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.SUBSCRIPTIONS_DETECT_CLIPBOARD, EmptySchema, async () => {
    try {
      const text = clipboard.readText()
      return okResult(detectClipboardLink(text))
    } catch (err) {
      return errResult('SUBSCRIPTIONS_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
