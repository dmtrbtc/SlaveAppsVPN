import type { AppProfile, AppProfileSnapshot } from '@slave-vpn/core'
import { createAndroidStorageAdapter } from './adapters/storage'

/**
 * Android quick-switch profile store — the renderer-side equivalent of the
 * Windows main-process ProfileStore, persisted via the Android StorageAdapter
 * (durable localStorage). A profile is a snapshot of the settings slice
 * (enabledScenarios / dnsPreset / vpnMode / selectedProxy / balancer …) captured
 * via core.captureSnapshot and re-applied via core.applySnapshot → settings.
 *
 * Mutations notify subscribers so the shared ProfileSwitcher (which refreshes on
 * `events.onProfilesChanged`) stays in sync, exactly like the desktop IPC event.
 */

const KEY = 'slave.profiles.v1'

export interface ProfilesSnapshot {
  profiles: AppProfile[]
  activeProfileId: string | null
}

const storage = createAndroidStorageAdapter()
let state: ProfilesSnapshot = { profiles: [], activeProfileId: null }
let loaded = false
const listeners = new Set<(s: ProfilesSnapshot) => void>()

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export async function loadProfiles(): Promise<void> {
  if (loaded) return
  try {
    const raw = await storage.get<ProfilesSnapshot>(KEY)
    if (raw && Array.isArray(raw.profiles)) {
      state = {
        profiles: raw.profiles.filter((p) => p && typeof p.id === 'string'),
        activeProfileId: raw.activeProfileId ?? null,
      }
    }
  } catch {
    /* start empty */
  }
  loaded = true
}

async function persist(): Promise<void> {
  try {
    await storage.set(KEY, state)
  } catch {
    /* best-effort */
  }
}

/** Sorted view (most-recently-used first, then name). */
export function listProfiles(): ProfilesSnapshot {
  const profiles = [...state.profiles].sort((a, b) => {
    const aT = a.lastUsedAt ?? 0
    const bT = b.lastUsedAt ?? 0
    if (aT !== bT) return bT - aT
    return a.name.localeCompare(b.name)
  })
  return { profiles, activeProfileId: state.activeProfileId }
}

function notify(): void {
  const snap = listProfiles()
  for (const l of listeners) {
    try {
      l(snap)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeProfiles(cb: (s: ProfilesSnapshot) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getProfile(id: string): AppProfile | null {
  return state.profiles.find((p) => p.id === id) ?? null
}

export async function createProfile(
  input: { name: string; description?: string },
  snapshot: AppProfileSnapshot,
): Promise<AppProfile> {
  const profile: AppProfile = {
    id: uuid(),
    name: input.name.trim() || 'Профиль',
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    snapshot,
    createdAt: Date.now(),
    lastUsedAt: null,
  }
  state.profiles.push(profile)
  await persist()
  notify()
  return profile
}

export async function removeProfile(id: string): Promise<void> {
  state.profiles = state.profiles.filter((p) => p.id !== id)
  if (state.activeProfileId === id) state.activeProfileId = null
  await persist()
  notify()
}

export async function markProfileApplied(id: string): Promise<AppProfile | null> {
  const idx = state.profiles.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const cur = state.profiles[idx]
  if (!cur) return null
  state.profiles[idx] = { ...cur, lastUsedAt: Date.now() }
  state.activeProfileId = id
  await persist()
  notify()
  return state.profiles[idx]
}
