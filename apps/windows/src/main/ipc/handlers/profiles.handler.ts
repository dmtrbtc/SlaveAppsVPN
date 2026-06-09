import { z } from 'zod'
import { IpcChannel } from '../../../shared/ipc/channels'
import { okResult, errResult } from '../../../shared/ipc/types'
import { handleIpc, services } from '../registry'
import { EmptySchema } from '../../../shared/ipc/schemas'
import { getProfileStore } from '../../services/ProfileStore'
import { getSettingsStore } from '../../services/SettingsStore'
import { sendToRenderer } from '../../window'
import { getLogger } from '../../logger'
import { captureSnapshot, applySnapshot as coreApplySnapshot } from '@slave-vpn/core'
import type { RuntimeService } from '../../services/RuntimeService'
import type { AppProfileSnapshot } from '../../../shared/ipc/types'

const SaveCurrentSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
})

const RemoveSchema = z.object({ id: z.string().min(1) })

const ApplySchema = z.object({
  id: z.string().min(1),
  hotReload: z.boolean().optional(),
})

// Snapshot the *current* user-facing settings into an AppProfileSnapshot.
// Capture logic now lives in @slave-vpn/core (captureSnapshot).
function snapshotCurrent(): AppProfileSnapshot {
  return captureSnapshot(getSettingsStore().getAll())
}

// Apply a snapshot to settings. Returns true if any field changed.
// Patch-building delegates to core.applySnapshot; persistence + change
// detection stay here (Windows sync settings store).
function applySnapshot(snapshot: AppProfileSnapshot): boolean {
  const store = getSettingsStore()
  const before = store.getAll()
  const patch = coreApplySnapshot(snapshot)

  if (Object.keys(patch).length === 0) return false
  store.patch(patch)

  // Detect if anything actually changed (cheap deep check via JSON)
  const after = store.getAll()
  return JSON.stringify(before) !== JSON.stringify(after)
}

export function registerProfilesHandlers(): void {
  const store = getProfileStore()
  const log = getLogger()

  handleIpc(IpcChannel.PROFILES_LIST, EmptySchema, async () => {
    return okResult({
      profiles: store.list(),
      activeProfileId: store.getActiveId(),
    })
  })

  handleIpc(IpcChannel.PROFILES_SAVE_CURRENT, SaveCurrentSchema, async (payload) => {
    try {
      const snapshot = snapshotCurrent()
      const input: import('../../../shared/ipc/types').ProfileCreateInput = {
        name: payload.name,
        ...(payload.description !== undefined ? { description: payload.description } : {}),
      }
      const profile = store.create(input, snapshot)
      sendToRenderer(IpcChannel.EVENT_PROFILES_CHANGED, {
        profiles: store.list(),
        activeProfileId: store.getActiveId(),
      })
      log.info({ id: profile.id, name: profile.name }, 'Profile created')
      return okResult(profile)
    } catch (err) {
      return errResult('PROFILES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.PROFILES_REMOVE, RemoveSchema, async ({ id }) => {
    try {
      store.remove(id)
      sendToRenderer(IpcChannel.EVENT_PROFILES_CHANGED, {
        profiles: store.list(),
        activeProfileId: store.getActiveId(),
      })
      return okResult(undefined)
    } catch (err) {
      return errResult('PROFILES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })

  handleIpc(IpcChannel.PROFILES_APPLY, ApplySchema, async ({ id, hotReload }) => {
    try {
      const profile = store.getById(id)
      if (!profile) return errResult('PROFILE_NOT_FOUND', `Profile not found: ${id}`)

      const changed = applySnapshot(profile.snapshot)
      const updated = store.markApplied(id) ?? profile

      // Trigger hot reload if connected and the user opted in
      if (changed && hotReload && services.has('runtime')) {
        const runtime = services.resolve<RuntimeService>('runtime')
        runtime.notifySubscriptionsChanged().catch((err: unknown) =>
          log.warn({ err }, 'Profile hot reload failed'))
      }

      sendToRenderer(IpcChannel.EVENT_PROFILES_CHANGED, {
        profiles: store.list(),
        activeProfileId: store.getActiveId(),
      })
      log.info({ id, name: profile.name, changed }, 'Profile applied')
      return okResult(updated)
    } catch (err) {
      return errResult('PROFILES_ERROR', err instanceof Error ? err.message : String(err))
    }
  })
}
