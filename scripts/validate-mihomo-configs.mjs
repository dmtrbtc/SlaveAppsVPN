#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { MIHOMO_WINDOWS } from './engine-manifest.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const mihomoPath = resolve(
  process.env.SLAVE_MIHOMO_BIN ??
    join(repoRoot, 'apps', 'windows', 'resources', 'bin', MIHOMO_WINDOWS.outName)
)
const rulesDir = join(repoRoot, 'apps', 'windows', 'resources', 'rules')

const require = createRequire(import.meta.url)
const { generateMihomoConfig } = require('../packages/config/dist/cjs/index.js')
const { buildAndroidDnsProfile } = require('../packages/dns/dist/cjs/index.js')
const { composeScenarios } = require('../packages/routing/dist/cjs/index.js')
const {
  mergeGeoSiteDat,
  readGeoSiteCategories,
} = require('../packages/runtime/dist/mihomo/geositeCategories.js')

function fail(message) {
  console.error(`[mihomo-config-test] ERROR: ${message}`)
  process.exitCode = 1
}

function runMihomo(args, label) {
  const result = spawnSync(mihomoPath, args, {
    encoding: 'utf8',
    timeout: 45_000,
    windowsHide: true,
  })
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (result.status !== 0) {
    throw new Error(`${label} exited with ${result.status}${output ? `\n${output}` : ''}`)
  }
  return output
}

function extractGeneratedValue(output, label) {
  const match = output.match(new RegExp(`^${label}:\\s+(\\S+)`, 'm'))
  if (!match) throw new Error(`mihomo generate did not return ${label}`)
  return match[1]
}

function buildSubscription() {
  const mlkemOutput = runMihomo(['generate', 'vless-mlkem768'], 'generate vless-mlkem768')
  const realityOutput = runMihomo(['generate', 'reality-keypair'], 'generate reality-keypair')
  const encryption = `mlkem768x25519plus.native.0rtt.${extractGeneratedValue(mlkemOutput, 'Client')}`
  const realityPublicKey = extractGeneratedValue(realityOutput, 'PublicKey')

  return `
proxies:
  - name: VLESS-Encryption
    type: vless
    server: enc.example.test
    port: 443
    network: tcp
    udp: true
    uuid: 00000000-0000-4000-8000-000000000001
    encryption: ${encryption}
  - name: VLESS-Reality-Vision
    type: vless
    server: reality.example.test
    port: 443
    network: tcp
    udp: true
    uuid: 00000000-0000-4000-8000-000000000002
    flow: xtls-rprx-vision
    tls: true
    servername: reality.example.test
    client-fingerprint: chrome
    reality-opts:
      public-key: ${realityPublicKey}
      short-id: 0123456789abcdef
  - name: Hysteria2
    type: hysteria2
    server: hysteria.example.test
    port: 443
    password: test-password
    sni: hysteria.example.test
    skip-cert-verify: true
  - name: TUIC
    type: tuic
    server: tuic.example.test
    port: 443
    uuid: 00000000-0000-4000-8000-000000000003
    password: test-password
    alpn:
      - h3
    udp-relay-mode: native
    congestion-controller: bbr
`.trim()
}

const baseSettings = {
  tunEnabled: false,
  tunStack: 'gvisor',
  fakeIpEnabled: false,
  dnsOverHttps: 'https://1.1.1.1/dns-query',
  fallbackDns: ['8.8.8.8'],
  mixedPort: 7890,
}

function androidDnsProfile(ruDirectDns) {
  return buildAndroidDnsProfile({
    dohUrl: 'https://1.1.1.1/dns-query',
    nodeDomainSuffixes: [
      'enc.example.test',
      'reality.example.test',
      'hysteria.example.test',
      'tuic.example.test',
    ],
    ruDirectDns,
    extraFakeIpFilter: [],
  })
}

function buildCases(subscriptionYaml, runetAvailableGeoSites) {
  const common = {
    subscriptionYaml,
    apiPort: 19090,
    apiSecret: 'mihomo-config-test-only',
    utlsFingerprint: 'chrome',
  }
  const nodeDomainSuffixes = [
    'enc.example.test',
    'reality.example.test',
    'hysteria.example.test',
    'tuic.example.test',
  ]

  return [
    {
      name: 'windows-protocol-matrix',
      context: { ...common, vpnMode: 'full', settings: baseSettings, rulesDir },
    },
    {
      name: 'windows-tun-gvisor-fake-ip',
      context: {
        ...common,
        vpnMode: 'full',
        settings: { ...baseSettings, tunEnabled: true, fakeIpEnabled: true },
        rulesDir,
      },
    },
    {
      name: 'windows-runet-geosite-merge',
      mergeRunetGeosite: true,
      context: {
        ...common,
        vpnMode: 'bypass',
        settings: baseSettings,
        rulesDir,
        availableGeoSites: runetAvailableGeoSites,
        routingPolicy: (() => {
          const policy = composeScenarios(['runetfreedom-bypass']).policy
          return { mode: policy.mode, defaultAction: policy.defaultAction, rules: policy.providerRules }
        })(),
      },
    },
    {
      name: 'android-smart-routing-dns',
      context: {
        ...common,
        vpnMode: 'bypass',
        settings: { ...baseSettings, fakeIpEnabled: true },
        dnsProfile: androidDnsProfile(true),
        androidRouting: {
          mode: 'smart',
          nodeDomainSuffixes,
          bypassProviders: [],
          geoEnabled: true,
        },
      },
    },
    {
      name: 'android-global-routing-dns',
      context: {
        ...common,
        vpnMode: 'full',
        settings: { ...baseSettings, fakeIpEnabled: true },
        dnsProfile: androidDnsProfile(false),
        androidRouting: {
          mode: 'global',
          nodeDomainSuffixes,
          bypassProviders: [],
          geoEnabled: true,
        },
      },
    },
  ]
}

function seedGeoData(homeDir, mergeRunetGeosite = false) {
  const geoip = join(rulesDir, 'geoip.dat')
  const geosite = join(rulesDir, 'geosite.dat')
  for (const source of [geoip, geosite]) {
    if (!existsSync(source)) {
      throw new Error(`Required geo fixture is missing: ${source}. Run pnpm download:binaries first.`)
    }
  }
  copyFileSync(geoip, join(homeDir, 'geoip.dat'))

  if (mergeRunetGeosite) {
    const runet = join(rulesDir, 'geosite-runetfreedom.dat')
    if (!existsSync(runet)) {
      throw new Error(`Required RuNet fixture is missing: ${runet}. Run pnpm download:binaries first.`)
    }
    const merged = mergeGeoSiteDat(readFileSync(geosite), [readFileSync(runet)])
    writeFileSync(join(homeDir, 'geosite.dat'), merged)
  } else {
    copyFileSync(geosite, join(homeDir, 'geosite.dat'))
  }
}

function main() {
  if (!existsSync(mihomoPath)) {
    throw new Error(`Mihomo binary is missing: ${mihomoPath}. Run pnpm download:binaries first.`)
  }
  const version = runMihomo(['-v'], 'mihomo -v')
  if (!version.includes(MIHOMO_WINDOWS.version)) {
    throw new Error(`Expected ${MIHOMO_WINDOWS.version}, got: ${version.split('\n')[0]}`)
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'slave-mihomo-config-test-'))
  try {
    const baseCategories = readGeoSiteCategories(join(rulesDir, 'geosite.dat'))
    const runetCategories = readGeoSiteCategories(join(rulesDir, 'geosite-runetfreedom.dat'))
    const runetAvailableGeoSites = [...new Set([...baseCategories, ...runetCategories])]
    const cases = buildCases(buildSubscription(), runetAvailableGeoSites)
    for (const testCase of cases) {
      const homeDir = join(tempRoot, testCase.name)
      mkdirSync(homeDir, { recursive: true })
      seedGeoData(homeDir, testCase.mergeRunetGeosite)
      const configPath = join(homeDir, 'config.yaml')
      const yaml = generateMihomoConfig(testCase.context)
      if (testCase.mergeRunetGeosite && !yaml.includes('GEOSITE,ru-blocked,')) {
        throw new Error(`${testCase.name}: generated config lost the ru-blocked rule`)
      }
      writeFileSync(configPath, yaml, 'utf8')
      runMihomo(['-d', homeDir, '-f', configPath, '-t'], testCase.name)
      console.log(`[mihomo-config-test] ✓ ${testCase.name}`)
    }
    console.log(
      `[mihomo-config-test] ${cases.length} configurations passed on ${MIHOMO_WINDOWS.version}`
    )
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
