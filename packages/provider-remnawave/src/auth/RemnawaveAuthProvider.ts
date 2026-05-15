import type { AuthTokens, User } from '@slave-vpn/shared'
import type { AuthProvider, TelegramFlowHandle, TelegramDeepLinkCallbacks } from '@slave-vpn/provider'
import type { AuthApiService } from '@slave-vpn/api'
import type { TelegramAuthFlow } from '@slave-vpn/api'

export class RemnawaveAuthProvider implements AuthProvider {
  constructor(
    private readonly authApi: AuthApiService,
    private readonly telegramFlow: TelegramAuthFlow
  ) {}

  async loginEmail(email: string, password: string): Promise<AuthTokens> {
    return this.authApi.loginEmail(email, password)
  }

  async loginTelegram(initData: string): Promise<AuthTokens> {
    const params = new URLSearchParams(initData)
    const userRaw = params.get('user')
    if (!userRaw) throw new Error('Invalid Telegram initData: missing user field')

    const parsed = JSON.parse(userRaw) as {
      id: number
      first_name: string
      last_name?: string
      username?: string
      photo_url?: string
    }

    return this.authApi.loginTelegramWidget({
      id: parsed.id,
      first_name: parsed.first_name,
      ...(parsed.last_name !== undefined ? { last_name: parsed.last_name } : {}),
      ...(parsed.username !== undefined ? { username: parsed.username } : {}),
      ...(parsed.photo_url !== undefined ? { photo_url: parsed.photo_url } : {}),
      auth_date: Number(params.get('auth_date') ?? 0),
      hash: params.get('hash') ?? '',
    })
  }

  startTelegramDeepLinkFlow(callbacks: TelegramDeepLinkCallbacks): TelegramFlowHandle {
    const promise = this.telegramFlow.start({
      onStateChange: (state) => {
        if (state.type === 'link_ready') {
          callbacks.onLinkReady(state.link)
        }
      },
    })

    return {
      promise,
      cancel: () => this.telegramFlow.cancel(),
    }
  }

  async logout(): Promise<void> {
    await this.authApi.logout()
  }

  async getMe(): Promise<User> {
    return this.authApi.getMe()
  }
}
