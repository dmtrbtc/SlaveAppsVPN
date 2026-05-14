import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { AuthTokens } from '@slave-vpn/shared'
import { STORAGE } from '@slave-vpn/shared'
import { getLogger } from '../logger'

const SECURE_DIR_NAME = 'secure'

class SecureStorage {
  private readonly secureDir: string

  constructor() {
    this.secureDir = join(app.getPath('userData'), SECURE_DIR_NAME)
    mkdirSync(this.secureDir, { recursive: true })
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  encrypt(plaintext: string): Buffer {
    if (!this.isAvailable()) {
      throw new Error(
        'OS-level encryption is not available. ' +
          'This can happen on Windows without a signed-in user profile.'
      )
    }
    return safeStorage.encryptString(plaintext)
  }

  decrypt(encrypted: Buffer): string {
    if (!this.isAvailable()) {
      throw new Error('OS-level encryption is not available.')
    }
    return safeStorage.decryptString(encrypted)
  }

  private filePath(key: string): string {
    const safeKey = key.replace(/[^a-z0-9._-]/gi, '_')
    return join(this.secureDir, `${safeKey}.bin`)
  }

  write(key: string, plaintext: string): void {
    const encrypted = this.encrypt(plaintext)
    writeFileSync(this.filePath(key), encrypted)
  }

  read(key: string): string | null {
    const path = this.filePath(key)
    if (!existsSync(path)) return null
    try {
      const data = readFileSync(path)
      return this.decrypt(data)
    } catch (error) {
      getLogger().error({ key, error }, 'Failed to decrypt secure storage entry')
      return null
    }
  }

  delete(key: string): void {
    const path = this.filePath(key)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }

  // ─── Token-specific helpers ────────────────────────────────────────────────

  storeTokens(tokens: AuthTokens): void {
    this.write(STORAGE.TOKENS_KEY, JSON.stringify(tokens))
    getLogger().debug('Auth tokens stored securely')
  }

  loadTokens(): AuthTokens | null {
    const raw = this.read(STORAGE.TOKENS_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthTokens
    } catch {
      getLogger().error('Failed to parse stored auth tokens — clearing')
      this.clearTokens()
      return null
    }
  }

  clearTokens(): void {
    this.delete(STORAGE.TOKENS_KEY)
    getLogger().debug('Auth tokens cleared')
  }

  hasTokens(): boolean {
    return this.read(STORAGE.TOKENS_KEY) !== null
  }
}

let _instance: SecureStorage | null = null

export function getSecureStorage(): SecureStorage {
  if (!_instance) {
    _instance = new SecureStorage()
  }
  return _instance
}
