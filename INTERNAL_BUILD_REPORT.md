# SLAVE VPN — Internal Build Report
## v0.2.0-internal-preview · 2026-05-17

---

## Artifacts

| File | Size | SHA-256 |
|------|------|---------|
| `SlaveAppsVPN-Setup-v0.2.0.exe` | 85.38 MB | `BC573D299DD222FB62A27B15BC75ED6B74ED16FF9EDF2EAFBA784E5C55A2D1EF` |
| `SlaveAppsVPN-Portable-v0.2.0.exe` | 85.18 MB | `B1B17E8B71C788299687BA575D1D99AE1050133B95CC699ABAA7510A436999B9` |

Location: `apps/windows/release/0.2.0/`

---

## Build Environment

| Item | Value |
|------|-------|
| Platform | Windows 10 Pro 10.0.19045 |
| Node.js | v24.15.0 |
| Electron | 33.4.11 |
| electron-builder | 25.1.8 |
| electron-vite | 2.3.0 |
| pnpm | 9.15.4 |
| TypeScript | 5.7.3 |
| better-sqlite3 | 11.10.0 (compiled for Electron 33 x64) |

---

## Build Targets

| Target | Format | Arch | Result |
|--------|--------|------|--------|
| NSIS Installer | `.exe` | x64 | ✅ `SlaveAppsVPN-Setup-v0.2.0.exe` |
| Portable | `.exe` | x64 | ✅ `SlaveAppsVPN-Portable-v0.2.0.exe` |

---

## Security Audit

| Check | Result | Notes |
|-------|--------|-------|
| `contextIsolation: true` | ✅ PASS | Set in BrowserWindow webPreferences |
| `nodeIntegration: false` | ✅ PASS | Set in BrowserWindow webPreferences |
| `sandbox: true` | ✅ PASS | Renderer is fully sandboxed |
| `webSecurity: true` | ✅ PASS | No mixed content allowed |
| No devtools in production | ✅ PASS | `openDevTools()` only in `is.dev` branch |
| No source maps in bundle | ✅ PASS | Zero `.map` files in `out/` |
| No secrets in renderer bundle | ✅ PASS | Renderer uses IPC — no direct API keys |
| No `.env` files committed | ✅ PASS | None found in repository |
| Provider isolation | ✅ PASS | `provider-remnawave` imported only in `bootstrap.ts` |
| IPC localhost validation | ✅ PASS | IpcValidator blocks localhost-origin requests in production |
| Code signing | ⚠️ SKIPPED | No EV certificate — SmartScreen warnings expected |

---

## Bundle Analysis

| Target | Output | Size |
|--------|--------|------|
| Main process | `out/main/index.js` | 31.99 kB |
| Preload | `out/preload/index.js` | 4.66 kB |
| Renderer JS | `out/renderer/assets/index-DktmoNaX.js` | 1,370 kB |
| Renderer CSS | `out/renderer/assets/index-gx3p8_Vf.css` | 32 kB |
| App asar (packed) | `app.asar` | 50.4 MB |
| Native modules (unpacked) | `app.asar.unpacked/better-sqlite3` | ~10.8 MB (incl. sqlite3.c source) |

**Note:** Renderer JS is 1.37 MB minified. This includes React 19, Framer Motion, TanStack Query, Radix UI, and all app code. Production-grade tree-shaking is active; no source maps emitted.

---

## Known Limitations

### Production Blockers (VPN won't function)
- **`resources/bin/` is empty** — No `mihomo.exe` or `wintun.dll`. App launches and renders UI, but VPN connect will fail with engine initialization error. Binaries must be supplied separately before actual VPN testing.
- **WinTUN driver** — Not installed on test machine. Required for TUN mode. Full-tunnel mode will fail without it.

### Non-blocking for UI testing
- **Code signing absent** — Windows SmartScreen will warn on first launch. Users must click "More info → Run anyway". Requires EV certificate acquisition for public distribution.
- **Placeholder icons** — `icon.ico` / `icon.png` are programmatically generated placeholders. Final brand assets needed before public release.
- **API base URL defaults to `https://change-me.example.com/api`** — Must be configured in Settings → API URL before authenticating. Correct value: production Remnawave backend endpoint.
- **Telegram bot username empty** — Must be configured in Settings.
- **Auto-updater** — Configured and wired. Will check GitHub Releases for updates once code-signed. Not functional without code signing.
- **Renderer bundle size** — 1.37 MB uncompressed. Gzipped in transit would be ~350 kB. Future: route-based code splitting to reduce initial load.
- **sqlite3.c source (8.81 MB)** — Included in `app.asar.unpacked` by electron-builder (standard behavior for better-sqlite3). Not a security issue, but increases disk footprint.

---

## Feature Readiness

| Feature | Status | Notes |
|---------|--------|-------|
| App launch | ✅ Expected functional | |
| TitleBar (minimize/maximize/close) | ✅ Functional | Window control IPC wired |
| Login (email) | ✅ UI functional | Requires configured API URL |
| Login (Telegram deep-link) | ✅ UI functional | Requires bot username config |
| Dashboard / Connection orb | ✅ UI functional | Disconnected state until binary supplied |
| Health status display | ✅ Functional | Updates via IPC health events |
| Diagnostics event timeline | ✅ Functional | Ring buffer, 200 events |
| Settings page | ✅ Functional | Persists to `userData/settings.json` |
| VPN connect/disconnect | ⛔ Blocked | Requires mihomo.exe in resources/bin |
| Routing configuration UI | ✅ UI functional | Backend integration pending |
| DNS profile selection | ✅ UI functional | Backend integration pending |
| Auto-updater | ⚠️ Partial | Wired but requires code signing |
| Tray icon | ✅ Functional | Graceful fallback on missing icon files |

---

## Release Readiness

**INTERNAL PREVIEW — NOT FOR PUBLIC DISTRIBUTION**

| Gate | Status |
|------|--------|
| Typecheck | ✅ 21/21 passing |
| Production build | ✅ NSIS + Portable |
| Security baseline | ✅ contextIsolation/sandbox/no-devtools |
| No secrets in bundle | ✅ |
| Git tag | ✅ `v0.2.0-internal-preview` |
| Code signing | ❌ Required before public release |
| Mihomo binary | ❌ Required for VPN functionality |
| Brand icons | ❌ Placeholder only |

**Verdict:** Ready for **internal UI/UX review** on developer machines. NOT ready for end-user testing of VPN functionality.

---

## Next Milestones

### For VPN functional testing
1. Obtain `mihomo.exe` (Mihomo core binary, Mihomo project)
2. Obtain `wintun.dll` (WireGuard/WinTUN from wintun.net)
3. Place both in `apps/windows/resources/bin/`
4. Configure Remnawave API endpoint and Telegram bot username
5. Rebuild

### For public distribution
1. Acquire EV code signing certificate
2. Set up CI/CD signing pipeline (CSC_LINK / CSC_KEY_PASSWORD env vars)
3. Final brand assets (icon.ico, icon.png, tray icons)
4. Add WinTUN driver installation in NSIS script (`resources/build/*.nsh`)
5. Penetration test / security audit

### Technical debt
- Route-based code splitting in renderer (reduce 1.37 MB initial bundle)
- `postcss.config.js` → `postcss.config.mjs` (eliminate ESM warning)
- `description` and `author` fields in `apps/windows/package.json`
- `postinstall: electron-builder install-app-deps` script in package.json
