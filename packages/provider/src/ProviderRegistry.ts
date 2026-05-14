import type { VPNProvider } from './VPNProvider'
import type { ProviderManifest } from './ProviderManifest'

export interface RegisteredProvider {
  readonly manifest: ProviderManifest
  readonly factory: () => VPNProvider
}

export class ProviderRegistry {
  private readonly entries = new Map<string, RegisteredProvider>()
  private _activeId: string | null = null

  register(manifest: ProviderManifest, factory: () => VPNProvider): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(`Provider already registered: ${manifest.id}`)
    }
    this.entries.set(manifest.id, { manifest, factory })
  }

  unregister(id: string): void {
    if (this._activeId === id) {
      throw new Error(`Cannot unregister active provider: ${id}`)
    }
    this.entries.delete(id)
  }

  activate(id: string): VPNProvider {
    const entry = this.entries.get(id)
    if (!entry) throw new Error(`Provider not registered: ${id}`)
    this._activeId = id
    return entry.factory()
  }

  getActive(): string | null {
    return this._activeId
  }

  getManifest(id: string): ProviderManifest | undefined {
    return this.entries.get(id)?.manifest
  }

  listManifests(): readonly ProviderManifest[] {
    return [...this.entries.values()].map(e => e.manifest)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }
}
