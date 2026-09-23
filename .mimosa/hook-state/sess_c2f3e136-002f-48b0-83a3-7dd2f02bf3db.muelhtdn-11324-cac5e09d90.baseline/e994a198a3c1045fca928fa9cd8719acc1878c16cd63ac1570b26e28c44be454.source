import type { AuthProvider } from './AuthProvider'
import type { SubscriptionProvider } from './SubscriptionProvider'
import type { ConfigSource } from './ConfigSource'
import type { ProviderCapabilities } from './ProviderCapabilities'

export interface VPNProvider {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities
  readonly auth: AuthProvider
  readonly subscription: SubscriptionProvider
  getConfigSource(): ConfigSource
}
