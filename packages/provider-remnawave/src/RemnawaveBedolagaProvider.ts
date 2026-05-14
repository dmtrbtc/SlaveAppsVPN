import { createApiClient, AuthApiService, SubscriptionApiService, TelegramAuthFlow } from '@slave-vpn/api'
import type { TokenStorage } from '@slave-vpn/api'
import type { VPNProvider, ConfigSource, ProviderCapabilities } from '@slave-vpn/provider'
import { RemnawaveAuthProvider } from './auth/RemnawaveAuthProvider'
import { RemnawaveSubscriptionProvider } from './subscription/RemnawaveSubscriptionProvider'
import { RemnawaveConfigSource } from './subscription/RemnawaveConfigSource'

export interface RemnawaveProviderConfig {
  apiBaseUrl: string
  tokenStorage: TokenStorage
  onSessionExpired: () => void
}

export class RemnawaveBedolagaProvider implements VPNProvider {
  readonly id = 'remnawave-bedolaga'
  readonly displayName = 'Remnawave'
  readonly capabilities: ProviderCapabilities = {
    telegramAuth: true,
    emailAuth: true,
    payments: true,
    multiDevice: true,
    serverSelection: true,
    trialAvailable: true,
  }

  readonly auth: RemnawaveAuthProvider
  readonly subscription: RemnawaveSubscriptionProvider

  private readonly configSource: RemnawaveConfigSource

  constructor(config: RemnawaveProviderConfig) {
    const apiClient = createApiClient({
      baseUrl: config.apiBaseUrl,
      tokenStorage: config.tokenStorage,
      onSessionExpired: config.onSessionExpired,
    })

    const authApi = new AuthApiService(apiClient)
    const subscriptionApi = new SubscriptionApiService(apiClient)
    const telegramFlow = new TelegramAuthFlow(apiClient.axios)

    this.auth = new RemnawaveAuthProvider(authApi, telegramFlow)
    this.subscription = new RemnawaveSubscriptionProvider(subscriptionApi)
    this.configSource = new RemnawaveConfigSource(this.subscription)
  }

  getConfigSource(): ConfigSource {
    return this.configSource
  }
}
