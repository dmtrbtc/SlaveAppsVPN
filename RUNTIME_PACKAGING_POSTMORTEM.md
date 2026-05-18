# Runtime Packaging Postmortem — v0.3.0-rc1

**Date:** 2026-05-18  
**Severity:** P0 — packaged app launched but VPN connect always failed  
**Symptom:** "Mihomo binary not found. Please reinstall application" on every connect()

---

## Root Cause #1 — Mihomo binary absent from `resources/bin/` (PRIMARY)

### What happened

`apps/windows/resources/bin/` had only a `.gitkeep` file. No `mihomo.exe` or `wintun.dll`.

electron-builder correctly reads `extraResources` from `electron-builder.yml`:
```yaml
extraResources:
  - from: resources/bin
    to: bin
    filter:
      - '**/*.exe'
      - '**/*.dll'
```

But since there were no `.exe` or `.dll` files in the source directory, the packaged app's `resources/bin/` was empty.

### Path resolution was correct

`WindowsMihomoEngine.ts` resolved paths correctly:
```typescript
const resourcesPath = process.resourcesPath ?? path.dirname(process.execPath)
binaryPath: path.join(resourcesPath, 'bin', 'mihomo.exe')
```

For NSIS install: `C:\Program Files\slave-vpn\resources\bin\mihomo.exe`  
For portable: `C:\Temp\<random>\resources\bin\mihomo.exe`

### Fix

Downloaded and placed binaries into `apps/windows/resources/bin/`:
- `mihomo.exe` — v1.19.25 from MetaCubeX/mihomo (Windows amd64), 46 MB
- `wintun.dll` — v0.14.1 from wintun.net (amd64), 427 KB

electron-builder now confirms packaging: `signing with signtool.exe path=...resources\bin\mihomo.exe`

---

## Root Cause #2 — Empty proxy group crashes mihomo (SECONDARY)

### What happened

When connecting with a subscription that returns `proxies: []`, the config generator included proxy groups from the subscription's `proxy-groups:` section verbatim:

```typescript
'proxy-groups': [
  ...managedGroups,
  ...profile.proxyGroups,  // ← included even if empty
]
```

If the subscription had:
```yaml
proxy-groups:
  - name: → Remnawave
    type: select
    proxies: []
```

The generated Mihomo config contained this empty group. Mihomo exits immediately:
```
Parse config error: proxy group[1]: → Remnawave: `use` or `proxies` missing
```

The mihomo process dies before the API ever starts. `waitForApi()` times out after 15 seconds → engine enters `error` state.

### Fix — ConfigGenerator.ts

```typescript
'proxy-groups': [
  ...managedGroups,
  // Filter out groups with no proxies — mihomo rejects empty select/url-test groups
  ...profile.proxyGroups.filter(g => g.proxies.length > 0),
]
```

---

## Root Cause #3 — `error → starting` FSM transition blocked (SECONDARY)

### What happened

After mihomo crashes (API timeout), the engine FSM transitions to `error` state. When the user (or `RecoveryCoordinator`) calls `connect()` again:

1. `RuntimeServiceImpl.connect()` → `manager.connect()` → `engine.start()`
2. `MihomoEngine.start()` allowed calling from `error` state (checked condition)
3. But then `fsm.transition('starting')` threw because `error → starting` is not an allowed transition

The state machine defines:
```typescript
['error', new Set<RuntimeState>(['idle'])],  // error can only go to idle
```

`restart()` handled this correctly (reset to idle first), but `start()` did not.

### Fix — MihomoEngine.ts

```typescript
async start(profile: ConnectionProfile): Promise<void> {
  // ...
  // Error is a terminal state — reset to idle before transitioning to starting
  if (state === 'error') {
    this.fsm.transition('idle', 'error_reset')
    this.events.emit('stateChanged', { state: 'idle' })
  }
  this.fsm.transition('starting')
```

---

## Root Cause #4 — `countProxiesInYaml` counted proxy-group names as proxies (CONTRIBUTING)

### What happened

`subscriptionNormalizer.ts` used:
```typescript
function countProxiesInYaml(yaml: string): number {
  return (yaml.match(/^[ \t]*-[ \t]+name[ \t]*:/gm) ?? []).length
}
```

This regex matched `- name:` anywhere — including proxy-group names (`- name: → Remnawave`). A subscription with `proxies: []` but `proxy-groups: [{name: → Remnawave}]` returned `proxyCount = 1`, bypassing the guard `if (proxyCount === 0) throw new Error(...)`.

Result: empty subscriptions passed through to config generation and caused the mihomo crash (Root Cause #2).

### Fix

```typescript
function countProxiesInYaml(yaml: string): number {
  const proxySection = yaml.match(/^proxies\s*:\s*\n([\s\S]*?)(?=^\S|\n[a-z-]+\s*:|\n*$)/m)
  const section = proxySection?.[1] ?? ''
  return (section.match(/^[ \t]*-[ \t]+name[ \t]*:/gm) ?? []).length
}
```

Now only counts entries within the `proxies:` YAML block.

---

## Root Cause #5 — `.gitignore` excluded runtime source files (INFRASTRUCTURE)

### What happened

`.gitignore` contained:
```
mihomo/
```

This pattern matched `packages/runtime/src/mihomo/` (the MihomoEngine source code), causing all 6 engine implementation files to be untracked. The files existed and compiled correctly, but were invisible to git.

### Fix

```gitignore
# Before (too broad):
mihomo/

# After (targeted to working directories only):
**/AppData/**/mihomo/
apps/windows/mihomo/
```

The `packages/runtime/src/mihomo/` source files are now tracked.

---

## Root Cause #6 — `packages/localization` had same ESM/CJS issue as `packages/api` (MINOR)

Same `"module": "Node16"` / `"moduleResolution": "node16"` conflict with `@slave-vpn/shared` ESM package. Fixed with `"module": "CommonJS"` / `"moduleResolution": "node"`.

---

## Audit checklist

| Check | Finding |
|-------|---------|
| `resources/bin/` has mihomo.exe | ✅ Fixed — 46 MB binary added |
| `resources/bin/` has wintun.dll | ✅ Fixed — 427 KB DLL added |
| `process.resourcesPath` correct | ✅ Correct in both NSIS and portable |
| Empty proxy group filter | ✅ Fixed in ConfigGenerator.ts |
| State machine `error → starting` | ✅ Fixed in MihomoEngine.ts |
| `countProxiesInYaml` accuracy | ✅ Fixed in subscriptionNormalizer.ts |
| `.gitignore` coverage | ✅ Fixed — source files now tracked |
| `packages/localization` typecheck | ✅ Fixed |

---

## Test results

**Binary packaging**: `pnpm dist` logs `signing with signtool.exe  path=...resources\bin\mihomo.exe` confirming binary is included.

**Portable extraction**: binary confirmed at `C:\Temp\<random>\resources\bin\mihomo.exe` (46 MB) and `wintun.dll` (427 KB).

**Startup**: No ENGINE_MISSING error on launch.

**Config generation**: mihomo starts successfully when given a valid config (empty proxy groups filtered out).

**Empty subscription**: Now correctly throws "YAML subscription contains no proxies" before mihomo starts, instead of crashing mihomo with a config parse error.

**Connectivity**: Cannot fully test — test subscription URL `sub.slave-apps.online/x3-1saMxMYm2_-SR` has zero proxy nodes configured server-side. App requires a Remnawave instance with active nodes for end-to-end VPN test.

---

## Prevention

1. **Binary acquisition must be documented in CI/CD** — add `scripts/download-binaries.sh` that fetches mihomo and wintun from known-good URLs and places in `resources/bin/`
2. **Filter all subscription-sourced proxy groups** before writing config — empty groups are always invalid in mihomo
3. **Engine state resets must be explicit** — callers should use `restart()`, not `start()` from error state
4. **`.gitignore` patterns should be scoped** — avoid bare directory names that match source trees
