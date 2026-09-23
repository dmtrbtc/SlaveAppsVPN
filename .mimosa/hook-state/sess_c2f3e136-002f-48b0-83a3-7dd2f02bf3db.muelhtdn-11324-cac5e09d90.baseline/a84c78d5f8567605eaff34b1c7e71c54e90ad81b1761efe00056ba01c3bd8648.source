import type { ProviderCapabilities } from './ProviderCapabilities'

export type ProviderTier = 'community' | 'verified' | 'official'

export interface ProviderContact {
  readonly website?: string
  readonly support?: string
  readonly telegram?: string
}

export interface ProviderManifest {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly tier: ProviderTier
  readonly capabilities: ProviderCapabilities
  readonly contact?: ProviderContact
  readonly logoUrl?: string
  readonly privacyPolicyUrl?: string
  readonly termsUrl?: string
}
