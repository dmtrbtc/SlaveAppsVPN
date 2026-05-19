// Re-export from platform-neutral @slave-vpn/config subscription subsystem.
// This shim exists for backward compatibility with existing imports.
export { buildClashYaml as buildMihomoYaml } from '@slave-vpn/config'
export type { ProxyEntry } from '@slave-vpn/config'
