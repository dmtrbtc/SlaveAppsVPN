# Codex state

## CURRENT HANDOFF — 2026-09-14, v0.2.41-dev.14 release

The next Windows and Android validation release is prepared in the isolated worktree
`E:\SlaveApps\.worktrees\windows-regression` on branch
`codex/windows-regression`, based on published prerelease `v0.2.41-dev.13`.
The dirty main checkout remains untouched. No commit, push, tag, release, or
installed-client replacement was performed.

- Windows and Android package versions are `0.2.41-dev.14`; prerelease notes,
  changelog, README Dev link, and an automated release-readiness validator were
  added. Stable download links remain on `v0.2.40`.
- Release workflows now build the exact requested tag. Stable Windows releases
  fail unless all packaged executables have a valid common Authenticode
  certificate. Tagged Android releases fail when production signing material is
  absent and retain the pinned release-certificate check.
- The stale-selector recovery and escaped VLESS Reality import fixes remain in
  this candidate, with synthetic regression coverage only. User-supplied key
  material is not stored in the repository.
- Typecheck 24/24, strict lint, config 39/39, core 66/66, runtime 42/42,
  routing 8/8, DNS 6/6, Windows renderer 32/32, and Windows lifecycle 62/62
  pass. Android Lint plus debug and unsigned release assembly pass for version
  code 914; both ARM ABIs, the web bundle, and the native `go.LoadJNI` bridge
  are present.
- The local Windows installer and portable package pass packaged-runtime,
  resource, native SQLite, and compiled-file verification. Local Windows and
  Android release artifacts are intentionally unsigned; protected CI is the
  only accepted source of final signed artifacts.
- The previously reported production `extract-zip` path was removed by dropping
  the unused `@electron-toolkit/utils` runtime dependency. Local production
  dependency reachability no longer includes either package. A fresh online npm
  audit was not permitted by the execution environment and remains a CI gate.

This prerelease is authorized for publication on the Dev channel. Promotion to
Stable remains blocked on production signature readback, Windows
upgrade/fresh-install smoke, Android release-key upgrade and broader device/DNS
testing, live VPN validation for the reported subscription shape, and a
licensing decision for the GPL-3.0 Mihomo library linked into an otherwise
proprietary Android app. Full ML-DSA-65 verification of `pqv` remains unsupported
by bundled Mihomo.

Canonical status: `docs/DEV_RELEASE_READINESS_0.2.41-dev.14.md`.

## PREVIOUS HANDOFF — 2026-09-13, escaped Reality key import and selector recovery

The installed `v0.2.41-dev.13` logs, screenshots, and two supplied VLESS keys
showed two independent problems. This stage remained local in
`E:\SlaveApps\.worktrees\windows-regression` on branch
`codex/windows-regression`; the dirty main checkout was not edited. Real key
material was not copied into source, tests, documentation, or logs.

- A removed saved node was accepted only through MihomoEngine's startup fallback
  to `SLAVE-AUTO`, while SettingsStore retained the unavailable name. Every later
  mode/profile update rebuilt the profile from that stale setting and Mihomo
  rejected it with HTTP 400 `Selector update error: proxy not exist`.
- RuntimeServiceImpl now validates a manual selection against the exact aggregated
  YAML before connect or hot reload. With positive evidence that the node is gone,
  it applies `SLAVE-AUTO`, persists that fallback only after the engine succeeds,
  publishes the corrected selection, and guards against concurrent selection or
  disconnect races. Empty/unparseable evidence remains conservative.
- Added regressions for mode-change fallback, preservation of an available manual
  node, and reconnect after a node disappeared while disconnected.
- Markdown-escaped proxy links are now normalized before detection and parsing,
  including escaped scheme punctuation, user-info separator, dots, and base64url
  underscores. A proxy URI pasted through the subscription-URL flow is validated
  and stored canonically as `single-proxy`, so it is never fetched as HTTP.
- VLESS Reality parsing now maps `spx` to Mihomo `reality-opts.spider-x`. Presence
  of Xray's `pqv` marker enables Mihomo's supported
  `reality-opts.support-x25519mlkem768` handshake mode. The `pqv` verification
  value itself is not emitted: bundled Mihomo v1.19.30 has no ML-DSA-65 verify
  field, and the repository's Xray engine remains unimplemented.
- Added synthetic-only regression coverage for escaped-key parsing, clipboard
  detection, subscription-type conversion, canonical storage, and generated
  Reality options. Bundled Mihomo v1.19.30 accepted all 8 generated configs.
- Verified Windows lifecycle 62/62, renderer 32/32, Windows node/web typecheck,
  config tests 39/39, boundary validation 299/299, Mihomo configs 8/8, and
  `git diff --check`.

No commit, push, tag, build, release, installed-client replacement, live VPN
connection, server change, or external-node smoke was performed. The sensitive
keys should be rotated because they were shared in chat. The local app path now
accepts these links and generates the Mihomo compatibility option, but full Xray
ML-DSA-65 `pqv` verification still requires an implemented Xray runtime or future
Mihomo support. Publication remains separately authorized work.

Current stage: Android verification and dev-channel release preparation for
`v0.2.41-dev.13`. Work remains isolated and uncommitted in branch
`codex/windows-regression` at
`E:\SlaveApps\.worktrees\windows-regression`; the main checkout was not edited.

The candidate includes Windows regression fixes, Android subscription storage
recovery and last-known-good nodes, deterministic source deduplication,
connection-quality startup progress, exact-version release notes, and a hardened
manual Android release workflow that checks out the requested tag.

All local test, typecheck, lint, boundary, Mihomo, Capacitor, Android Lint, APK
build, APK inspection, and physical-device gates pass. On Xiaomi 23117RA68G the
exact final debug APK retained one subscription and four unique nodes through a
normal cold restart and through deliberate local-index removal followed by
Preferences recovery. It returned to protected quality 100/100 with no fatal,
duplicate-plugin, or storage failures. The debug package was removed and the
production app returned to the foreground.

See `ANDROID_PREPUBLICATION_VERIFICATION.md` and
`WINDOWS_REGRESSION_INVESTIGATION.md`. Two high `extract-zip@2.0.1` dependency
advisories remain documented; there are no critical production audit findings.

No commit, push, tag, release, GitHub signing run, production install, or online
feed/download verification occurred. The next stage is review and publication
of `v0.2.41-dev.13` only after explicit authorization.
