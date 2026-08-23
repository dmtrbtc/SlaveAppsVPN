#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const androidDir = join(scriptDir, '..', 'android')
const gradleArgs = process.argv.slice(2)

if (gradleArgs.length === 0) {
  console.error('Usage: node scripts/run-gradle.mjs <gradle-task> [...args]')
  process.exit(2)
}

const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const result = spawnSync(wrapper, gradleArgs, {
  cwd: androidDir,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(`Unable to start ${wrapper}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
