import { app } from 'electron'
import { parseImportDeepLink } from '@slave-vpn/shared'
import { IpcChannel } from '../shared/ipc/channels'
import { sendToRenderer } from './window'
import { getLogger } from './logger'

// A `slavevpn://import/...` link that launched the app before the renderer was
// ready. The renderer pulls it via DEEPLINK_GET_PENDING once mounted.
let pending: string | null = null

/** Register the `slavevpn://` custom protocol so the OS routes links to the app. */
export function registerDeepLinkProtocol(): void {
  try {
    // In a packaged build the launcher exe is the handler. In dev (electron .)
    // the protocol must point at the electron binary + the app path, else it
    // registers electron itself — skip dev to avoid clobbering.
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient('slavevpn')
    } else if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('slavevpn', process.execPath, [process.argv[1]!])
    }
  } catch (err) {
    getLogger().warn({ err }, 'Failed to register slavevpn:// protocol')
  }
}

/** Find the first `slavevpn://import...` argument in a process argv array. */
export function extractDeepLink(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === 'string' && parseImportDeepLink(arg)) return arg
  }
  return null
}

/** Cold start: stash a launch deep link for the renderer to pull when ready. */
export function captureLaunchDeepLink(argv: readonly string[]): void {
  const url = extractDeepLink(argv)
  if (url) {
    pending = url
    getLogger().info('Captured launch deep link for import')
  }
}

/** Renderer pulled the pending link — return and clear it. */
export function consumePendingDeepLink(): string | null {
  const url = pending
  pending = null
  return url
}

/** Warm start (second-instance): push the link straight to the renderer. */
export function dispatchDeepLink(argv: readonly string[]): void {
  const url = extractDeepLink(argv)
  if (url) {
    getLogger().info('Dispatching warm deep link for import')
    sendToRenderer(IpcChannel.EVENT_DEEPLINK_IMPORT, url)
  }
}
