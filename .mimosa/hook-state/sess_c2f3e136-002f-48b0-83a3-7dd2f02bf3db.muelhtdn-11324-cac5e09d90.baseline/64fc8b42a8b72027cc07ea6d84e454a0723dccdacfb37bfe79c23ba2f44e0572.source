import type { TokenStorage } from '@slave-vpn/api'
import type { AuthTokens } from '@slave-vpn/shared'
import { getSecureStorage } from '../../security/SecureStorage'

export class ElectronTokenStorage implements TokenStorage {
  async getAccessToken(): Promise<string | null> {
    const tokens = getSecureStorage().loadTokens()
    if (!tokens) return null
    return tokens.accessToken
  }

  async getRefreshToken(): Promise<string | null> {
    const tokens = getSecureStorage().loadTokens()
    if (!tokens) return null
    // Refresh token is ONLY returned here, never exposed to renderer
    return tokens.refreshToken
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    getSecureStorage().storeTokens(tokens)
  }

  async clearTokens(): Promise<void> {
    getSecureStorage().clearTokens()
  }

  async hasTokens(): Promise<boolean> {
    return getSecureStorage().hasTokens()
  }
}
