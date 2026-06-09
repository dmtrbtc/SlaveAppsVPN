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
