import type { AuthService } from '../AuthService'
import type { AuthProvider } from '@slave-vpn/provider'
import type { AuthTokens, User } from '@slave-vpn/shared'
import { getLogger } from '../../logger'

export class AuthServiceImpl implements AuthService {
  constructor(private readonly provider: AuthProvider) {}

  async loginEmail(email: string, password: string): Promise<AuthTokens> {
    getLogger().info({ email: email.replace(/(?<=.{2}).(?=[^@]*@)/g, '*') }, 'Email login attempt')
    return this.provider.loginEmail(email, password)
  }

  async loginTelegram(initData: string): Promise<AuthTokens> {
    getLogger().info('Telegram widget login attempt')
    return this.provider.loginTelegram(initData)
  }

  startTelegramDeepLinkFlow(onLinkReady: (link: string) => void) {
    return this.provider.startTelegramDeepLinkFlow({ onLinkReady })
  }

  async logout(): Promise<void> {
    getLogger().info('Logging out')
    await this.provider.logout()
  }

  async getMe(): Promise<User> {
    return this.provider.getMe()
  }

  async refresh(): Promise<AuthTokens> {
    // Token refresh is handled internally by the API client interceptor.
    // This method exists for manual pre-warming; the interceptor owns the actual flow.
    throw new Error('Use API client interceptor for automatic token refresh')
  }
}
