/**
 * Key/value persistence, platform-agnostic.
 *
 * Windows backs this with electron-store (main process); Android with Capacitor
 * Preferences (mirrored to localStorage as a durable primary, per the existing
 * Android subscription-store strategy). The core never touches a concrete store.
 *
 * Values are JSON-serialisable. Implementations own (de)serialisation so the
 * core can store plain objects.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  /** Returns all keys under an optional prefix (for store enumeration). */
  keys(prefix?: string): Promise<string[]>
}
