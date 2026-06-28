import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core'

/**
 * Android in-app updater — thin wrapper over the native SlaveVpn plugin's
 * `downloadAndInstallUpdate`. The native side downloads the APK (emitting
 * `updateProgress` events) and launches the system PackageInstaller, so there is
 * no browser hop. The OS still shows its mandatory "Install?" sheet and requires
 * the one-time "install unknown apps" grant — that can't be bypassed for a
 * sideloaded APK.
 */
interface NativeUpdater {
  downloadAndInstallUpdate(options: { url: string }): Promise<void>
  addListener(
    eventName: 'updateProgress',
    listener: (data: { percent: number }) => void,
  ): Promise<PluginListenerHandle>
}

const Native = registerPlugin<NativeUpdater>('SlaveVpn')

/** Thrown (as message substring) by the native side when the install-unknown-apps grant is missing. */
export const NEEDS_INSTALL_PERMISSION = 'NEEDS_INSTALL_PERMISSION'

/**
 * Download + install the APK in-app, reporting download progress (0–100).
 * Resolves once the native installer session has been committed (the system
 * "Install?" sheet then takes over). Only valid on a native platform.
 */
export async function androidDownloadAndInstall(
  url: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('not a native platform')
  const handle = await Native.addListener('updateProgress', (p) => onProgress(p.percent))
  try {
    await Native.downloadAndInstallUpdate({ url })
  } finally {
    await handle.remove()
  }
}
