export { RuntimeManager } from './RuntimeManager'

export { createEngine } from './engine/EngineFactory'
export type {
  VPNEngine,
  EngineType,
  EngineInitConfig,
  ConnectionProfile,
  GeneratorSettings,
  TunHooks,
} from './engine/VPNEngine.interface'

export type { EngineCapabilities } from './engine/EngineCapabilities'
export { getEngineCapabilities } from './engine/EngineCapabilities'

export { EngineEventBus } from './engine/EngineEvents'
export type {
  EngineEventMap,
  EngineEventName,
  EngineEventHandler,
  Unsubscribe,
} from './engine/EngineEvents'

export type {
  RuntimeState,
  StopReason,
  HotReloadType,
  RestartReason,
  RuntimeStateTransition,
  HealthStatus,
} from './state/RuntimeState'

export { RuntimeStateMachine } from './state/RuntimeStateMachine'
export { EMPTY_HEALTH } from './state/RuntimeState'

// Node probing subsystem
export type {
  ProbeTarget,
  ProbeResult,
  NodeHealthSnapshot,
  ProbeSchedulerOptions,
  ProbeFailureReason,
} from './probing'
export { NodeProber, NodeHealthTracker, ProbeScheduler } from './probing'
