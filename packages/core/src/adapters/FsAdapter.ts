/**
 * Filesystem access for geo databases (geoip.dat / geosite.dat) and on-disk
 * rule-provider lists.
 *
 * Windows backs this with node:fs; Android with the Capacitor Filesystem API
 * (the native engine reads the files the renderer writes). The core uses it to
 * stage geo files into the engine's working dir and to read available geosite
 * categories for the unknown-category filter.
 *
 * `paths` are opaque, platform-resolved strings — the core never constructs an
 * absolute path itself; it asks the EngineAdapter / app for base dirs.
 */
export interface FsAdapter {
  readBytes(path: string): Promise<Uint8Array | null>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  readText(path: string): Promise<string | null>
  writeText(path: string, data: string): Promise<void>
  exists(path: string): Promise<boolean>
  ensureDir(path: string): Promise<void>
  /** Copy when dest is missing or older/different size — used for geo staging. */
  copyIfNewer(src: string, dest: string): Promise<boolean>
}
