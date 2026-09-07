# Windows lifecycle dev.11 verification

Date: 2026-09-07. Worktree: `E:\SlaveApps\.worktrees\windows-lifecycle`.
Base HEAD: `f3277ffcebe462702f744d4585e02413488cda95`, branch `codex/windows-lifecycle-fix`, including the uncommitted lifecycle changes documented in CODEX_STATE.md. Separate P3.1 changes are excluded.

## Scope

User requested completion of the remaining step and an installable corrected dev build. Local version: `0.2.41-dev.11`, above the recorded `dev.10` baseline. No release publication or installation is implied.

## Verification

- Runtime regressions: 31/31 passed.
- Windows lifecycle regressions: 29/29 passed.
- Renderer regressions: 21/21 passed.
- Typecheck: 24/24 tasks passed.
- Architecture boundaries: 297 rules passed.
- Generated Mihomo configurations: 8/8 passed with v1.19.30, including Android configurations.
- Windows application build and `git diff --check`: passed.
- `node scripts/windows-lifecycle-live-smoke.cjs`: passed with actual Windows Mihomo process, actual HTTP control API, real config files and actual process termination/restart. Timestamped outcomes: `WINDOWS_LIFECYCLE_LIVE_SMOKE.json`.

The live harness checks clean start, delayed identical-profile no-op, Manual/AUTO/Manual hot switching, mode reload without process replacement, selection error over real HTTP with exact previous disk config/selection restoration, full restart, forced process crash and recovery, and confirmed exit on stop. The original production lifecycle methods run; no process or API mocks are used.

## Isolation and limits

The harness uses a fresh directory inside this worktree, dynamic local ports, a generated controller secret and a synthetic loopback SOCKS endpoint. It never reads installed settings. After production config generation it disables the DNS listener, binds the proxy listener to loopback and replaces group probe URLs with loopback. TUN is disabled by the supplied profile. External health monitor connectivity/DNS checks are replaced; real API and process health checks remain. Temporary config and secret are removed after the run.

This proves process/API lifecycle behavior, **not full Electron/TUN end-to-end operation**. No valid isolated VPN test subscription is available in the task; real user settings must not be copied. Normal app startup registers the shared `slavevpn` protocol and has no explicit isolated-client mode. A full separately identified client/userData smoke has therefore not been claimed. Actual driver/routing/DNS traffic, Electron UI interactions, sleep/resume and Android device tests remain unverified. The host was not suspended and the installed client was not replaced. Historical cycle callers at 20:14:46–48 remain unconfirmed; the full audit remains a separate stage.

## Packaging inputs

Mihomo, geo data and the existing local sing-box/WinTUN resources were copied from the main checkout into the isolated worktree; original files were not modified. Electron 39.8.10 is reused from the existing local distribution after the default downloader failed with sandbox network EACCES. No dependency versions were upgraded.

The final build completed with pnpm dependency discovery, `--publish never`, the local Electron distribution and authorized access to the builder tool cache/downloads. NSIS installer and portable executable are under `apps/windows/release/0.2.41-dev.11/`. No publication, installation or Git mutation occurred. Authenticode status: **NotSigned**.

- Setup: 133279036 bytes, SHA-256 `fe4e2db3b5d1823237689419534e325f99031c9c525a08c77736dc85a3613de1`.
- Portable: 133047815 bytes, SHA-256 `a4f3704208b34c6e96343333d6dcd1b271e07c054a22bfd73834abbf7e804b35`.
- `SHA256SUMS.txt`, blockmap and local updater metadata were generated alongside the artifacts. Local metadata is not an available online update.
- Package verification uses Electron 39.8.10 in Node mode, without loading application main or installed userData: resolves all 34 direct dependencies inside app.asar, checks the lifecycle classes, compiled source equality, required engine resources and an in-memory native SQLite query. Evidence: `WINDOWS_LIFECYCLE_PACKAGE_VERIFICATION.json`.
