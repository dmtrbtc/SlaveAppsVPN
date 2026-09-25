import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const expected = process.argv[2] ?? JSON.parse(read('apps/windows/package.json')).version

function read(relative) {
  return readFileSync(resolve(root, relative), 'utf8')
}

function fail(message) {
  console.error(`[release-readiness] FAIL: ${message}`)
  process.exitCode = 1
}

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) fail(message)
}

if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(expected)) {
  fail(`invalid version: ${expected}`)
}

for (const packagePath of ['apps/windows/package.json', 'apps/android/package.json']) {
  const actual = JSON.parse(read(packagePath)).version
  if (actual !== expected) fail(`${packagePath} has ${actual}, expected ${expected}`)
}

const tag = `v${expected}`
const notesRelative = `docs/releases/${tag}.md`
if (!existsSync(resolve(root, notesRelative))) {
  fail(`missing prepared release notes: ${notesRelative}`)
} else {
  const notes = read(notesRelative)
  if (!notes.startsWith(`# SLAVE VPN ${tag}\n`)) fail(`${notesRelative} has the wrong heading`)
}

const changelog = read('CHANGELOG.md')
if (!changelog.includes(`## [${expected}]`)) fail(`CHANGELOG.md has no ${expected} section`)

const windowsWorkflow = read('.github/workflows/windows.yml')
requireMatch(
  windowsWorkflow,
  /ref: \$\{\{ github\.event\.inputs\.release_tag != '' && github\.event\.inputs\.release_tag \|\| github\.ref \}\}/,
  'Windows workflow is not pinned to the requested release tag',
)
requireMatch(
  windowsWorkflow,
  /Stable release requires WIN_CSC_LINK/,
  'Windows workflow does not enforce signing for stable tags',
)
requireMatch(
  windowsWorkflow,
  /Invalid Authenticode signature/,
  'Windows workflow does not validate Authenticode output',
)
requireMatch(
  windowsWorkflow,
  /pnpm install --frozen-lockfile/,
  'Windows workflow does not install the immutable dependency lock',
)

const androidWorkflow = read('.github/workflows/android.yml')
requireMatch(
  androidWorkflow,
  /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.release_tag != '' && github\.event\.inputs\.release_tag \|\| github\.ref \}\}/,
  'Android workflow is not pinned to the requested release tag',
)
requireMatch(
  androidWorkflow,
  /\[ -n "\$REQUESTED_TAG" \]/,
  'Android workflow can attach an unsigned build to a requested release tag',
)
requireMatch(
  androidWorkflow,
  /test "\$GOT" = "\$PRODUCTION_CERT_SHA256"/,
  'Android workflow does not pin the production signing certificate',
)

const releaseWorkflow = read('.github/workflows/release.yml')
requireMatch(
  releaseWorkflow,
  /docs\/releases\/\$\{tag\}\.md/,
  'Release workflow does not consume prepared release notes',
)

const builder = read('apps/windows/electron-builder.yml')
if (/^\s*releaseType:\s*prerelease\s*$/m.test(builder)) {
  fail('electron-builder forces all publications to prerelease')
}

// NOTE: the stable-release README gate was removed (2026-09-25). README.md is
// intentionally dynamic (releases/latest badge and links) per the owner's
// positioning rewrite; requiring hardcoded per-version artifact names fought
// that design and made every stable tag need a README edit.

if (!process.exitCode) {
  console.log(`[release-readiness] PASS: ${tag} source, notes, versions, and signing guards are consistent`)
}
