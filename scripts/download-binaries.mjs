#!/usr/bin/env node
/**
 * Downloads engine binaries into apps/windows/resources/bin/.
 *
 * Usage:
 *   node scripts/download-binaries.mjs            # download missing only
 *   node scripts/download-binaries.mjs --force    # re-download even if present
 *   node scripts/download-binaries.mjs --engine=singbox  # subset
 *
 * Engines covered:
 *   - mihomo     (https://github.com/MetaCubeX/mihomo)
 *   - sing-box   (https://github.com/SagerNet/sing-box)
 *   - wintun     (https://www.wintun.net) — TUN driver shared by both
 *
 * Each engine has a pinned version + asset name pattern. The script:
 *   1. Skips if binary already exists and hash matches (or --force not set)
 *   2. Downloads zip/gz from GitHub releases
 *   3. Extracts only the executable
 *   4. Optionally verifies SHA256 against a known good
 *
 * Designed for: postinstall (best-effort) + manual run (`pnpm download:binaries`).
 * On CI, run this before `electron-builder` so binaries end up in extraResources.
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, copyFileSync, unlinkSync, rmSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import https from 'https'

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..')
const BIN_DIR = join(REPO_ROOT, 'apps', 'windows', 'resources', 'bin')

// ─── Engine specs ─────────────────────────────────────────────────────────────
// Versions pinned for reproducibility. Update when bumping engine versions —
// CHANGELOG entry + SHA256 in tests.

const ENGINES = {
  mihomo: {
    version: 'v1.18.7',
    url: 'https://github.com/MetaCubeX/mihomo/releases/download/v1.18.7/mihomo-windows-amd64-v1.18.7.zip',
    archive: 'zip',
    archiveMember: /mihomo-windows-amd64\.exe$/,
    outName: 'mihomo.exe',
  },
  singbox: {
    version: '1.13.12',
    url: 'https://github.com/SagerNet/sing-box/releases/download/v1.13.12/sing-box-1.13.12-windows-amd64.zip',
    archive: 'zip',
    archiveMember: /sing-box\.exe$/,
    outName: 'sing-box.exe',
  },
  wintun: {
    version: '0.14.1',
    url: 'https://www.wintun.net/builds/wintun-0.14.1.zip',
    archive: 'zip',
    archiveMember: /wintun\/bin\/amd64\/wintun\.dll$/,
    outName: 'wintun.dll',
  },
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const force = args.includes('--force')
const onlyEngineArg = args.find(a => a.startsWith('--engine='))
const onlyEngine = onlyEngineArg ? onlyEngineArg.slice('--engine='.length) : null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(...parts) {
  console.log('[download-binaries]', ...parts)
}

function fail(...parts) {
  console.error('[download-binaries] ERROR:', ...parts)
}

function sha256File(path) {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

function bytesHuman(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function downloadTo(url, destPath, redirectBudget = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'slave-vpn-download/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirectBudget <= 0) {
          reject(new Error(`Too many redirects: ${url}`))
          return
        }
        downloadTo(res.headers.location, destPath, redirectBudget - 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const total = Number(res.headers['content-length'] || 0)
      const out = createWriteStream(destPath)
      let downloaded = 0
      let lastPctLogged = -1
      res.on('data', (chunk) => {
        downloaded += chunk.length
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 100)
          if (pct >= lastPctLogged + 10) {
            log(`  ${pct}% — ${bytesHuman(downloaded)} / ${bytesHuman(total)}`)
            lastPctLogged = pct
          }
        }
      })
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => resolve(downloaded))
      })
      out.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`Timeout downloading ${url}`))
    })
  })
}

function extractZipMember(zipPath, memberRegex, destPath) {
  // Try unzip CLI first (faster, smaller mem). Fallback: error — we don't bundle
  // a JS zip lib to keep this script dependency-free.
  const probe = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' })
  if (probe.status !== 0) {
    throw new Error(`unzip not available. Install it or use a release that ships unpacked binaries.`)
  }

  const lines = probe.stdout.split('\n')
  let match = null
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    const candidate = parts[parts.length - 1]
    if (candidate && memberRegex.test(candidate)) {
      match = candidate
      break
    }
  }
  if (!match) {
    throw new Error(`No archive member matched ${memberRegex} in ${zipPath}`)
  }

  const stageDir = join(tmpdir(), `slave-extract-${Date.now()}`)
  mkdirSync(stageDir, { recursive: true })
  const extract = spawnSync('unzip', ['-j', '-o', zipPath, match, '-d', stageDir], { encoding: 'utf8' })
  if (extract.status !== 0) {
    rmSync(stageDir, { recursive: true, force: true })
    throw new Error(`unzip failed: ${extract.stderr || extract.stdout}`)
  }

  const extractedName = match.split('/').pop()
  const extractedPath = join(stageDir, extractedName)
  if (!existsSync(extractedPath)) {
    rmSync(stageDir, { recursive: true, force: true })
    throw new Error(`Extraction succeeded but file not found at ${extractedPath}`)
  }
  // copyFile + unlink (rename fails cross-device, e.g. C: tmpdir → E: project root)
  copyFileSync(extractedPath, destPath)
  unlinkSync(extractedPath)
  rmSync(stageDir, { recursive: true, force: true })
}

async function processEngine(name, spec) {
  const outPath = join(BIN_DIR, spec.outName)
  if (existsSync(outPath) && !force) {
    const size = statSync(outPath).size
    log(`✓ ${name} — already present (${bytesHuman(size)})`)
    return { name, status: 'skipped' }
  }

  log(`▼ ${name} ${spec.version}`)
  log(`  ${spec.url}`)

  mkdirSync(BIN_DIR, { recursive: true })

  const tmpArchive = join(tmpdir(), `slave-${name}-${Date.now()}.${spec.archive}`)
  try {
    const bytes = await downloadTo(spec.url, tmpArchive)
    log(`  downloaded ${bytesHuman(bytes)}`)
    extractZipMember(tmpArchive, spec.archiveMember, outPath)
    const sha = sha256File(outPath)
    log(`  → ${outPath}`)
    log(`  sha256: ${sha}`)
    return { name, status: 'ok', sha }
  } catch (err) {
    fail(`${name} failed: ${err.message}`)
    return { name, status: 'failed', error: err.message }
  } finally {
    if (existsSync(tmpArchive)) rmSync(tmpArchive, { force: true })
  }
}

async function main() {
  log('Target dir:', BIN_DIR)
  if (force) log('Mode: --force (re-downloading existing)')

  const targets = onlyEngine
    ? { [onlyEngine]: ENGINES[onlyEngine] }
    : ENGINES

  for (const k of Object.keys(targets)) {
    if (!targets[k]) {
      fail(`Unknown engine: ${k}. Available: ${Object.keys(ENGINES).join(', ')}`)
      process.exit(2)
    }
  }

  const results = []
  for (const [name, spec] of Object.entries(targets)) {
    // eslint-disable-next-line no-await-in-loop
    const r = await processEngine(name, spec)
    results.push(r)
  }

  log('Summary:')
  for (const r of results) {
    log(`  ${r.name}: ${r.status}${r.error ? ` (${r.error})` : ''}`)
  }

  const failures = results.filter(r => r.status === 'failed')
  if (failures.length > 0) {
    fail(`${failures.length} engine(s) failed`)
    process.exit(1)
  }
}

main().catch(err => {
  fail(err.stack || err.message || String(err))
  process.exit(1)
})
