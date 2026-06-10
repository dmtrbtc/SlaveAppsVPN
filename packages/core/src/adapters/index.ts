export type { StorageAdapter } from './StorageAdapter.js'
export type {
  NetworkAdapter,
  NetworkResponse,
  NetworkRequestOptions,
  NetworkBytesResponse,
} from './NetworkAdapter.js'
export type { FsAdapter } from './FsAdapter.js'
export type { EngineAdapter } from './EngineAdapter.js'

import type { StorageAdapter } from './StorageAdapter.js'
import type { NetworkAdapter } from './NetworkAdapter.js'
import type { FsAdapter } from './FsAdapter.js'
import type { EngineAdapter } from './EngineAdapter.js'

/**
 * Optional structured logger. Platforms pass their own (pino on Windows,
 * console on Android). The core stays silent if omitted.
 */
export interface CoreLogger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

/** The full set of platform capabilities the core needs to run. */
export interface CoreAdapters {
  storage: StorageAdapter
  network: NetworkAdapter
  fs: FsAdapter
  engine: EngineAdapter
  logger?: CoreLogger
}
