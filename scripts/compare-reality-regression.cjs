// Read-only historical comparison. Uses synthetic credentials exclusively.
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const cwd = path.resolve(__dirname, '..')
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const parserPath = 'packages/config/src/subscription/uriParser.ts'
const tags = ['v0.2.40', 'v0.2.41-dev.10', 'v0.2.41-dev.13', 'v0.2.41-dev.14', 'v0.2.41-dev.18']
const fixture = 'vless://00000000-0000-4000-8000-000000000001@node.example:11821?type=tcp&encryption=none&security=reality&pbk=' +
  'A'.repeat(43) + '&fp=chrome&sni=www.example.com&sid=a19c&spx=%2F&pqv=' + 'A'.repeat(2603) + '&flow=xtls-rprx-vision#Synthetic'
const parsed = new Map()
const rows = tags.map(tag => {
  const source = git('show', `${tag}:${parserPath}`)
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, URL, Buffer }, { timeout: 1000 })
  const proxy = JSON.parse(JSON.stringify(exports.parseProxyUri(fixture)))
  parsed.set(tag, proxy)
  const reality = proxy.extra['reality-opts']
  return {
    tag,
    androidCoreBlob: git('rev-parse', `${tag}:apps/android/libs/clashbox.aar`),
    preservesFlow: proxy.extra.flow === 'xtls-rprx-vision',
    preservesFingerprint: proxy.extra['client-fingerprint'] === 'chrome',
    verifiesPqv: typeof reality['mldsa65-verify'] === 'string',
    hybrid: reality['support-x25519mlkem768'] === true,
    fragmented: reality['fragment-client-hello'] === true,
  }
})
assert.deepEqual(parsed.get(tags[0]), parsed.get(tags[1]))
assert.deepEqual(parsed.get(tags[1]), parsed.get(tags[2]))
assert.equal(rows[1].androidCoreBlob, rows[2].androidCoreBlob)
assert.ok(rows.every(row => row.preservesFlow && row.preservesFingerprint))
console.log(JSON.stringify({ fixture: 'synthetic-only', baselineParserUnchangedThroughDev13: true, rows }, null, 2))
