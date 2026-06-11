#!/usr/bin/env node
/**
 * Architecture boundary validator.
 * Enforces dependency rules defined in ARCHITECTURE.md.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')

let violations = 0
let checked = 0

function fail(msg) {
  console.error(`  ✗ VIOLATION: ${msg}`)
  violations++
}

function check(description, filePaths, pattern, shouldMatch, message) {
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue
    const content = readFileSync(filePath, 'utf-8')
    const matches = pattern.test(content)
    checked++
    if (matches === shouldMatch) {
      fail(`${relative(ROOT, filePath)}: ${message}`)
    }
  }
}

function getSourceFiles(dir, exts = ['.ts', '.tsx']) {
  if (!existsSync(dir)) return []
  const files = []
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full)
      } else if (entry.isFile() && exts.some(e => entry.name.endsWith(e))) {
        files.push(full)
      }
    }
  }
  walk(dir)
  return files
}

console.log('\n🏗  Architecture Boundary Validation\n')

// ── Rule 1: routing must not import electron ──────────────────────────────────
console.log('Rule 1: packages/routing must not import electron')
{
  const files = getSourceFiles(join(ROOT, 'packages/routing/src'))
  check('routing → electron', files, /from ['"]electron['"]/, true,
    'packages/routing must NOT import electron')
}

// ── Rule 2: dns must not import electron ─────────────────────────────────────
console.log('Rule 2: packages/dns must not import electron')
{
  const files = getSourceFiles(join(ROOT, 'packages/dns/src'))
  check('dns → electron', files, /from ['"]electron['"]/, true,
    'packages/dns must NOT import electron')
}

// ── Rule 3: routing must not import provider ──────────────────────────────────
console.log('Rule 3: packages/routing must not import @slave-vpn/provider*')
{
  const files = getSourceFiles(join(ROOT, 'packages/routing/src'))
  check('routing → provider', files, /@slave-vpn\/provider/, true,
    'packages/routing must NOT import any provider package')
}

// ── Rule 4: dns must not import provider ─────────────────────────────────────
console.log('Rule 4: packages/dns must not import @slave-vpn/provider*')
{
  const files = getSourceFiles(join(ROOT, 'packages/dns/src'))
  check('dns → provider', files, /@slave-vpn\/provider/, true,
    'packages/dns must NOT import any provider package')
}

// ── Rule 5: config must not import electron ───────────────────────────────────
console.log('Rule 5: packages/config must not import electron')
{
  const files = getSourceFiles(join(ROOT, 'packages/config/src'))
  check('config → electron', files, /from ['"]electron['"]/, true,
    'packages/config must NOT import electron')
}

// ── Rule 6: runtime must not import provider-remnawave ───────────────────────
console.log('Rule 6: packages/runtime must not import @slave-vpn/provider-remnawave')
{
  const files = getSourceFiles(join(ROOT, 'packages/runtime/src'))
  check('runtime → provider-remnawave', files, /@slave-vpn\/provider-remnawave/, true,
    'packages/runtime must NOT import provider-remnawave')
}

// ── Rule 7: renderer must not import workspace packages directly ──────────────
console.log('Rule 7: renderer must not import @slave-vpn/* packages directly')
{
  const rendererSrc = join(ROOT, 'apps/windows/src/renderer/src')
  const files = getSourceFiles(rendererSrc)
  // Renderer-allowed packages: browser-safe shared types/utils, and the
  // platform-agnostic domain packages ONLY inside the
  // apps/windows/src/renderer/src/android/ subfolder — that folder IS the Android
  // bridge: there's no main process on Android, so it runs @slave-vpn/core
  // (over Capacitor StorageAdapter/NetworkAdapter/FsAdapter) and compiles the
  // engine config locally via config/dns/routing. This is the core-unification
  // architecture (docs/ARCHITECTURE_UNIFICATION.md), not a boundary leak.
  const ALWAYS_ALLOWED = new Set(['@slave-vpn/shared'])
  const ANDROID_BRIDGE_ALLOWED = new Set([
    '@slave-vpn/core',
    '@slave-vpn/config',
    '@slave-vpn/dns',
    '@slave-vpn/routing',
    '@slave-vpn/shared',
  ])
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const relFile = relative(ROOT, file)
    const inAndroidBridge = relFile.includes('renderer/src/android/') || relFile.includes('renderer\\src\\android\\')
    const matches = [...content.matchAll(/from ['"](@slave-vpn\/[^'"]+)['"]/g)]
    for (const match of matches) {
      const pkg = match[1]
      // Strip subpath: '@slave-vpn/shared/models' → '@slave-vpn/shared'
      const rootPkg = pkg.split('/').slice(0, 2).join('/')
      if (ALWAYS_ALLOWED.has(rootPkg)) continue
      if (inAndroidBridge && ANDROID_BRIDGE_ALLOWED.has(rootPkg)) continue
      checked++
      fail(`${relFile}: renderer imports ${pkg} directly (use IPC bridge instead)`)
    }
  }
}

// ── Rule 8: provider-remnawave must only appear in bootstrap ─────────────────
console.log('Rule 8: @slave-vpn/provider-remnawave only allowed in bootstrap.ts')
{
  const mainSrc = join(ROOT, 'apps/windows/src/main')
  const files = getSourceFiles(mainSrc)
  for (const file of files) {
    const rel = relative(ROOT, file)
    if (rel.includes('bootstrap.ts')) continue
    const content = readFileSync(file, 'utf-8')
    if (/@slave-vpn\/provider-remnawave/.test(content)) {
      checked++
      fail(`${rel}: imports provider-remnawave outside bootstrap.ts`)
    }
  }
  // Also check packages (except provider-remnawave itself)
  const pkgDirs = ['packages/routing', 'packages/dns', 'packages/config',
                   'packages/runtime', 'packages/api', 'packages/shared',
                   'packages/provider', 'packages/state-sync', 'packages/localization']
  for (const pkg of pkgDirs) {
    const files2 = getSourceFiles(join(ROOT, pkg, 'src'))
    check(`${pkg} → provider-remnawave`, files2, /@slave-vpn\/provider-remnawave/, true,
      `${pkg} must NOT import provider-remnawave`)
  }
}

// ── Rule 9: provider (interfaces) must not import implementations ─────────────
console.log('Rule 9: packages/provider must not import implementation packages')
{
  const files = getSourceFiles(join(ROOT, 'packages/provider/src'))
  check('provider → api', files, /@slave-vpn\/api/, true,
    'packages/provider (interfaces) must NOT import @slave-vpn/api')
  check('provider → runtime', files, /@slave-vpn\/runtime/, true,
    'packages/provider (interfaces) must NOT import @slave-vpn/runtime')
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  Checked ${checked} rules`)
if (violations === 0) {
  console.log('  ✓ All boundaries clean — no violations\n')
  process.exit(0)
} else {
  console.log(`\n  Found ${violations} violation(s). Fix before merging.\n`)
  process.exit(1)
}
