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
