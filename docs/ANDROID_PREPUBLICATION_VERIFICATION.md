# Android pre-publication verification — v0.2.41-dev.13

Date: 2026-09-13. Base commit: `ada0aba`. Worktree:
`E:\SlaveApps\.worktrees\windows-regression`.

## Subscription durability

- localStorage is the durable primary copy; Capacitor Preferences is an awaited
  native mirror and recovery source.
- Invalid local index data no longer shadows a valid native copy. Mirror reads
  retry during Capacitor startup and repair localStorage when valid data appears.
- Subscription input and index mutations are serialized and mirrored in order.
- Successful URL subscriptions retain a parsed last-known-good projection, so a
  temporary fetch, TLS, DNS, or parser failure does not empty the server list.
- Equivalent sources are collapsed by canonical source identity and priority.
- The unsupported bare Remnawave-key form remains hidden on Android.

No production subscription input, credential, token, or address was printed or
copied into the test report.

## Automated gates

- Core tests: 66/66.
- Runtime lifecycle, health, and rollback tests: 42/42.
- Renderer and Android storage tests: 32/32.
- Windows lifecycle regression tests: 58/58.
- Workspace typecheck: 24/24.
- Workspace lint tasks: 11/11.
- Architecture boundaries: 299 checked, no violations.
- Mihomo validation: 8/8 configurations on v1.19.30.
- Capacitor sync found App, Filesystem, Preferences, and Status Bar plugins.
- Android `lintDebug`, `assembleDebug`, and `assembleRelease`: passed.
- Android Lint: 0 errors and 17 existing warnings.
- GitHub workflow YAML parsing and `git diff --check`: passed.
- Production dependency audit: 0 critical; two high advisories remain in
  `extract-zip@2.0.1`. The earlier attempted direct replacement was incompatible
  with Electron's installer API, so its upgrade remains separate work.

## APK inspection

- Debug: `com.slavevpn.app.dev`, version name `0.2.41-dev.13`, version code 913,
  105,234,917 bytes, SHA-256
  `DFCCC8FA7D3204426AA1F5ECCA1E33A42C1BEC71F5A7E72B43199B98960FE779`.
  The debug signature verifies.
- Release: `com.slavevpn.app`, version name `0.2.41-dev.13`, version code 913,
  104,072,043 bytes, SHA-256
  `8F7B2EA4242335E37BED819CA4FBA8A318177D59ACB28DCAB83053D54531FA25`.
  The local release APK is intentionally unsigned.
- The APK contains arm64-v8a and armeabi-v7a `libgojni.so`, DEX files, and the
  Capacitor web bundle.

Artifacts are under `apps/android/release/0.2.41-dev.13/` and are ignored local
build outputs. GitHub Actions must produce and sign the publication artifact.

## Physical-device smoke

Tested the exact final debug APK on Xiaomi 23117RA68G (`emerald`, Android 16)
with the separate `.dev` application ID. The production package was neither
replaced nor cleared.

- First launch restored one cabinet-backed subscription and four unique nodes:
  `Slave-NL2`, `Slave-EE`, `Slave-FR`, and `Slave-NL 8`.
- Force-stop plus cold launch completed in 1.65 seconds. The subscription and
  the same four-node projection remained present; the tunnel reached
  `Защищено` and quality 100/100.
- The native Preferences mirror was confirmed to contain the subscription
  index. The localStorage index was then removed only from the debug package.
  A 1.58-second cold launch repaired localStorage from Preferences with one
  entry, kept all four nodes, and returned to 100/100.
- The exact final APK installed over the debug package with data preserved,
  cold-launched in 1.95 seconds, retained the one-entry index and all four
  unique nodes, and did not show stale dev.12 release notes.
- The final runs recorded zero AndroidRuntime fatal matches, duplicate Capacitor
  registration warnings, subscription-store failures, unknown-UUID errors, or
  device-limit errors.
- Android reported a VPN transport owned by the debug package with INTERNET
  capability. The application quality check reached 100/100.

The debug package was stopped and uninstalled. The production package was
returned to the foreground and was running after cleanup.

## GitHub release workflow

When `Android APK` is manually dispatched with `release_tag`, checkout now uses
that immutable tag and derives both package versions from it. This prevents an
APK built from a selected branch from being attached to a different release.
The tag syntax is validated before version mutation.

## Publication boundary

No commit, push, tag, GitHub release, production-ID install, or production
signature was created in this stage. Publication still requires review and
commit of this worktree, tag `v0.2.41-dev.13`, the GitHub production signing
secrets, pinned certificate verification, artifact attachment, and online
download/feed verification.
