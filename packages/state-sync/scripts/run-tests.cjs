// Runs the package tests under the workspace Electron in node mode.
// better-sqlite3 is a native module compiled for Electron's ABI by the
// app's postinstall; running the suite with the system Node would fail on
// NODE_MODULE_VERSION. ELECTRON_RUN_AS_NODE gives us the matching binary.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..', '..')
const exe = process.platform === 'win32' ? 'electron.exe' : 'electron'
const electronBin = path.join(root, 'apps', 'windows', 'node_modules', 'electron', 'dist', exe)

const res = spawnSync(electronBin, ['--test', 'test/stateSync.test.cjs'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
process.exit(res.status ?? 1)
