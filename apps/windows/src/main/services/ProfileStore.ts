import { randomUUID } from 'crypto'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getLogger } from '../logger'
import type {
  AppProfile,
  AppProfileSnapshot,
  ProfileCreateInput,
} from '../../shared/ipc/types'

const FILENAME = 'profiles.json'

interface StoredProfiles {
  profiles: AppProfile[]
  activeProfileId: string | null
}

const EMPTY: StoredProfiles = { profiles: [], activeProfileId: null }

export class ProfileStore {
  private state: StoredProfiles = EMPTY
  private readonly path: string

  constructor() {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    this.path = join(dir, FILENAME)
    this.load()
  }

  private load(): void {
    if (!existsSync(this.path)) return
    try {
      const raw = readFileSync(this.path, 'utf-8')
      const parsed = JSON.parse(raw) as StoredProfiles
      if (parsed && Array.isArray(parsed.profiles)) {
        this.state = {
          profiles: parsed.profiles.filter(p => p && typeof p.id === 'string'),
          activeProfileId: parsed.activeProfileId ?? null,
        }
      }
    } catch (err) {
      getLogger().warn({ err }, 'Failed to load profiles — starting empty')
    }
  }

  private persist(): void {
    try {
      writeFileSync(this.path, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (err) {
      getLogger().error({ err }, 'Failed to persist profiles')
    }
  }

  list(): AppProfile[] {
    // Sort by lastUsedAt desc, then name asc
    return [...this.state.profiles].sort((a, b) => {
      const aT = a.lastUsedAt ?? 0
      const bT = b.lastUsedAt ?? 0
      if (aT !== bT) return bT - aT
      return a.name.localeCompare(b.name)
    })
  }

  getById(id: string): AppProfile | null {
    return this.state.profiles.find(p => p.id === id) ?? null
  }

  getActiveId(): string | null {
    return this.state.activeProfileId
  }

  create(input: ProfileCreateInput, snapshot: AppProfileSnapshot): AppProfile {
    const profile: AppProfile = {
      id: randomUUID(),
      name: input.name.trim() || 'Untitled',
      ...(input.description ? { description: input.description.trim() } : {}),
      snapshot,
      createdAt: Date.now(),
      lastUsedAt: null,
    }
    this.state.profiles.push(profile)
    this.persist()
    return profile
  }

  update(id: string, patch: { name?: string; description?: string; snapshot?: AppProfileSnapshot }): AppProfile {
    const idx = this.state.profiles.findIndex(p => p.id === id)
    if (idx === -1) throw new Error(`Profile not found: ${id}`)
    const current = this.state.profiles[idx]
    if (!current) throw new Error(`Profile vanished: ${id}`)
    const next: AppProfile = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.snapshot !== undefined ? { snapshot: patch.snapshot } : {}),
    }
    this.state.profiles[idx] = next
    this.persist()
    return next
  }

  remove(id: string): void {
    this.state.profiles = this.state.profiles.filter(p => p.id !== id)
    if (this.state.activeProfileId === id) this.state.activeProfileId = null
    this.persist()
  }

  markApplied(id: string): AppProfile | null {
    const idx = this.state.profiles.findIndex(p => p.id === id)
    if (idx === -1) return null
    const current = this.state.profiles[idx]
    if (!current) return null
    this.state.profiles[idx] = { ...current, lastUsedAt: Date.now() }
    this.state.activeProfileId = id
    this.persist()
    return this.state.profiles[idx]
  }
}

let _instance: ProfileStore | null = null
export function getProfileStore(): ProfileStore {
  if (!_instance) _instance = new ProfileStore()
  return _instance
}
