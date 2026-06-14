import { IS_MOBILE } from './platform'

/**
 * Open an external URL in the system browser / app.
 *
 * Electron DENIES `window.open` (window.ts setWindowOpenHandler → action:'deny'),
 * so a raw window.open from the renderer silently does nothing on desktop. Route
 * it through the main process instead (shell.openExternal via the preload
 * `update.openExternal` bridge — validated, https/tg only). On Android the
 * Capacitor WebView opens window.open in the system browser, so keep that path.
 *
 * Accepts https:// links (cabinet, GitHub) and tg:// deep links (Telegram app).
 */
export function openExternalUrl(url: string): void {
  if (!IS_MOBILE) {
    const bridge = (window as unknown as {
      slaveVPN?: { update?: { openExternal?: (u: string) => unknown } }
    }).slaveVPN
    if (bridge?.update?.openExternal) {
      try { void bridge.update.openExternal(url); return } catch { /* fall through */ }
    }
  }
  try { window.open(url, '_system') } catch { try { window.open(url, '_blank') } catch { /* ignore */ } }
}
