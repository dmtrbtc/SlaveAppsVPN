import type { FsAdapter } from '@slave-vpn/core'

/**
 * Android FsAdapter — intentionally a no-op stub.
 *
 * On Android the geo databases are downloaded and staged by the NATIVE engine
 * (mihomo's geox-url auto-download), not the renderer, and rule-provider lists
 * are mihomo `rule-providers` fetched natively too. So the core's FS-using paths
 * (geo file staging on desktop) simply don't run on Android — there is no
 * @capacitor/filesystem dependency and the renderer has no real filesystem.
 *
 * These methods return empty/false rather than throwing, so a stray call can't
 * crash the bridge; if a genuinely Android-relevant FS need appears later, swap
 * this for a @capacitor/filesystem-backed implementation.
 */
export function createAndroidFsAdapter(): FsAdapter {
  return {
    async readBytes(): Promise<Uint8Array | null> {
      return null
    },
    async writeBytes(): Promise<void> {
      /* no-op: native engine owns files on Android */
    },
    async readText(): Promise<string | null> {
      return null
    },
    async writeText(): Promise<void> {
      /* no-op */
    },
    async exists(): Promise<boolean> {
      return false
    },
    async ensureDir(): Promise<void> {
      /* no-op */
    },
    async copyIfNewer(): Promise<boolean> {
      return false
    },
  }
}
