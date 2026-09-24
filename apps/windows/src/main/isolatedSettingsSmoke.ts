import { app } from 'electron'
import { existsSync, realpathSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import { tmpdir } from 'os'

export const isolatedSettingsSmoke = process.argv.includes('--isolated-settings-smoke')

/** Runs before instance locking, log files or safe-mode state access. */
export function initializeSettingsSmoke(): void {
  if (!isolatedSettingsSmoke) return
  if (app.isPackaged) throw new Error('Settings smoke is available only in development builds')
  const requested = process.env.SLAVE_SETTINGS_SMOKE_DIR
  if (!requested || !existsSync(requested)) throw new Error('Missing isolated settings directory')
  const directory = realpathSync(requested)
  const tempRoot = realpathSync(tmpdir())
  if (!directory.toLowerCase().startsWith((resolve(tempRoot) + sep).toLowerCase()) ||
      !basename(directory).startsWith('slave-settings-ui-') ||
      !existsSync(join(directory, '.settings-smoke'))) {
    throw new Error('Invalid isolated settings directory')
  }
  app.setName('SlaveSettingsUISmoke')
  app.setAppUserModelId('com.slavevpn.settings-smoke')
  app.setPath('userData', directory)
  app.setPath('sessionData', directory)
  app.setPath('crashDumps', join(directory, 'crashes'))
  delete process.env.ELECTRON_RENDERER_URL
}
