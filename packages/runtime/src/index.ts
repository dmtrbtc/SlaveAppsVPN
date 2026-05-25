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

// Balancer
export { NodeBalancer } from './balancer/NodeBalancer'
export type { BalancerMode, NodeScore, BalancerState, LatencyProber } from './balancer/NodeBalancer'

// Mihomo API types (re-exported so apps don't depend on internal paths)
export type {
  MihomoConnection,
  MihomoConnectionMetadata,
  MihomoConnectionsInfo,
} from './mihomo/MihomoApiClient'
