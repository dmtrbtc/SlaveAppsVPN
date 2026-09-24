import { randomBytes } from 'crypto'

/**
 * Single source of the per-session Mihomo external-controller secret.
 *
 * The secret is generated once per process and shared by every consumer
 * (engine config, tray wiring, IPC handlers). Previously each call site
 * passed its own value — an API base URL or an empty string — so any
 * consumer that created the balancer service first poisoned the singleton
 * and every subsequent probe failed with HTTP 401.
 */
let secret: string | null = null

export function getRuntimeApiSecret(): string {
  secret ??= randomBytes(16).toString('hex')
  return secret
}
