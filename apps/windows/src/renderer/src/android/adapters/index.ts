import type { StorageAdapter, NetworkAdapter, FsAdapter } from '@slave-vpn/core'
import { createAndroidStorageAdapter } from './storage'
import { createAndroidNetworkAdapter } from './network'
import { createAndroidFsAdapter } from './fs'

export { createAndroidStorageAdapter, createAndroidNetworkAdapter, createAndroidFsAdapter }

export interface AndroidDataAdapters {
  storage: StorageAdapter
  network: NetworkAdapter
  fs: FsAdapter
}

/**
 * The data-plane adapters @slave-vpn/core needs on Android. The EngineAdapter
 * (native plugin) is wired separately once the connect path moves through core
 * (P1) — it needs native geosite-category support to apply the unknown-category
 * filter the desktop engine already does.
 */
export function createAndroidDataAdapters(): AndroidDataAdapters {
  return {
    storage: createAndroidStorageAdapter(),
    network: createAndroidNetworkAdapter(),
    fs: createAndroidFsAdapter(),
  }
}
