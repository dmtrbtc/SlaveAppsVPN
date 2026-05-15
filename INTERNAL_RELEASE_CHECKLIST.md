# Internal Release Checklist — v0.2.0-internal-preview

## Pre-Build

- [x] `pnpm typecheck` — 21/21 tasks pass, zero errors
- [ ] `pnpm lint` — no ESLint violations
- [ ] Secrets audit — no `.env`, tokens, or credentials committed
- [ ] Binary audit — no pre-built `.exe`/`.dll` in source tree (only in `resources/bin/`)
- [ ] Provider isolation — `provider-remnawave` referenced only from `bootstrap.ts`

## Build Artifacts

- [ ] `pnpm dist` completes without error (from `apps/windows/`)
- [ ] `SlaveAppsVPN-Setup-v0.2.0.exe` produced in `release/0.2.0/`
- [ ] `SlaveAppsVPN-Portable-v0.2.0.exe` produced in `release/0.2.0/`
- [ ] SHA-256 checksums generated for both artifacts

### Native Module Note
> `better-sqlite3` requires native compilation (MSVC build tools).
> Build environment must have Visual Studio 2019+ with "Desktop Development with C++" workload,
> or use `@electron/rebuild` after `npm install`.

## Smoke Tests (manual, on clean Windows 10 x64)

- [ ] Installer launches without UAC elevation (`asInvoker`)
- [ ] App starts, TitleBar minimize/maximize/close work
- [ ] Login screen renders, email form is interactive
- [ ] Dashboard connection orb renders (disconnected state)
- [ ] Settings page opens and saves a setting
- [ ] Diagnostics page shows runtime event timeline
- [ ] App exits cleanly from tray

## GitHub Release

- [ ] Tag `v0.2.0-internal-preview` pushed to `git@github.com:dmtrbtc/SlaveAppsVPN.git`
- [ ] GitHub release created as **pre-release** (private repo)
- [ ] Both `.exe` artifacts attached
- [ ] Checksums included in release body
- [ ] Release marked **Do not distribute** in description

## Post-Release

- [ ] Release notes reviewed for any accidental internal info disclosure
- [ ] Shared with intended internal reviewers only
- [ ] Feedback tracked in project issues
