#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const androidDir = join(scriptDir, '..', 'android')
const rawGradleArgs = process.argv.slice(2)
const gradleArgs = []
for (const argument of rawGradleArgs) {
  const previous = gradleArgs.at(-1)
  // Unquoted dotted values can arrive from native Windows Node as
  // ["-Pname=0", ".0.1"]. Rejoin only a continuation of a Gradle property.
  if (argument.startsWith('.') && previous?.startsWith('-P') && previous.includes('=')) {
    gradleArgs[gradleArgs.length - 1] += argument
  } else {
    gradleArgs.push(argument)
  }
}

if (gradleArgs.length === 0) {
  console.error('Usage: node scripts/run-gradle.mjs <gradle-task> [...args]')
  process.exit(2)
}

const javaExecutable = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  : process.platform === 'win32' ? 'java.exe' : 'java'
const wrapperJar = join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar')
const wrapperArgs = [
  '-Dorg.gradle.appname=gradlew',
  '-classpath',
  wrapperJar,
  'org.gradle.wrapper.GradleWrapperMain',
  ...gradleArgs,
]

// Invoke GradleWrapperMain directly. Passing -P values through gradlew.bat with
// shell=true corrupts dotted values on Windows (for example versionName).
const result = spawnSync(javaExecutable, wrapperArgs, {
  cwd: androidDir,
  env: process.env,
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(`Unable to start Gradle wrapper with ${javaExecutable}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
