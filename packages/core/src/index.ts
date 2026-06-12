// @slave-vpn/core — platform-agnostic orchestration layer.
// See docs/ARCHITECTURE_UNIFICATION.md for the roadmap this package anchors.

export * from './types.js'
export * from './adapters/index.js'
export type {
  CoreFacade,
  CoreVpnApi,
  CoreEventsApi,
} from './facade/CoreFacade.js'
export { createCore } from './createCore.js'
export { CoreNotReadyError } from './errors.js'

// Orchestration (P0.2) — platform-agnostic domain logic.
export { composeRoutingPolicy } from './routing/composeRoutingPolicy.js'
export type { ComposeRoutingResult } from './routing/composeRoutingPolicy.js'
export { buildEngineConfig } from './runtime/buildEngineConfig.js'
export type { BuildEngineConfigInput, BuildEngineConfigResult } from './runtime/buildEngineConfig.js'

// DNS profile model (P0.2b) — preset/strategy resolution shared by both platforms.
export * from './dns/index.js'

// Subscription aggregation (P0.2c) — unified dedup/merge + fetch orchestration.
export * from './subscriptions/index.js'

// Settings model + remaining domain models (P0.2d): settings store, rule-provider
// presets/CRUD, profile snapshot transforms, geo source catalogue. (Balancer
// policy already lives in @slave-vpn/runtime NodeBalancer — not duplicated.)
export * from './settings/index.js'
export * from './rules/index.js'
export * from './profiles/index.js'
export * from './geo/index.js'

// Personal cabinet (bedolaga) — account/auth/subscription over adapters.
export * from './cabinet/index.js'
