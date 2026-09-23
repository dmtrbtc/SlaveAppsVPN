import type { AuthTokens } from '@slave-vpn/shared'

export interface TokenStorage {
  getAccessToken(): Promise<string | null>
  getRefreshToken(): Promise<string | null>
  setTokens(tokens: AuthTokens): Promise<void>
  clearTokens(): Promise<void>
  hasTokens(): Promise<boolean>
}

export class InMemoryTokenStorage implements TokenStorage {
  private tokens: AuthTokens | null = null

  async getAccessToken(): Promise<string | null> {
    return this.tokens?.accessToken ?? null
  }

  async getRefreshToken(): Promise<string | null> {
    return this.tokens?.refreshToken ?? null
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    this.tokens = tokens
  }

  async clearTokens(): Promise<void> {
    this.tokens = null
  }

  async hasTokens(): Promise<boolean> {
    return this.tokens !== null
  }
}
