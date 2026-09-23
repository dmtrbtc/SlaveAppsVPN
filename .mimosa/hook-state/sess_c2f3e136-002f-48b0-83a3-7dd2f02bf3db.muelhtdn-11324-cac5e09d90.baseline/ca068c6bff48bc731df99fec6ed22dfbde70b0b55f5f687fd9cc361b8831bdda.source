import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { StorageAdapter } from '@slave-vpn/core'

/**
 * Single-key JSON-file adapter used by the Windows settings store.
 *
 * The value is written as the file root (not inside a key/value envelope), so
 * existing `settings.json` installations remain compatible with the legacy
 * Windows store. A temporary file keeps interrupted serialisation away from the
 * last known-good file; copyFile is a Windows fallback for rename operations
 * that cannot replace an existing destination.
 */
export class JsonFileStorageAdapter implements StorageAdapter {
  private readonly filePath: string
  private readonly storageKey: string

  constructor(filePath: string, storageKey: string) {
    this.filePath = filePath
    this.storageKey = storageKey
  }

  async get<T>(key: string): Promise<T | null> {
    if (key !== this.storageKey) return null
    const raw = await readFile(this.filePath, 'utf-8')
    return JSON.parse(raw) as T
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.assertKey(key)
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8')
    try {
      try {
        await rename(tempPath, this.filePath)
      } catch {
        await copyFile(tempPath, this.filePath)
      }
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  }

  async remove(key: string): Promise<void> {
    this.assertKey(key)
    await rm(this.filePath, { force: true })
  }

  async keys(prefix?: string): Promise<string[]> {
    if (prefix && !this.storageKey.startsWith(prefix)) return []
    try {
      await access(this.filePath)
      return [this.storageKey]
    } catch {
      return []
    }
  }

  private assertKey(key: string): void {
    if (key !== this.storageKey) {
      throw new Error(`Unsupported JSON storage key: ${key}`)
    }
  }
}
