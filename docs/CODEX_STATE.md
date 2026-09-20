# Codex state

## CURRENT HANDOFF — 2026-09-20, dev.17 hybrid REALITY transport candidate

The `v0.2.41-dev.17` candidate addresses the remaining silent timeout seen on
the reporting Android device after dev.16 correctly selected the requested
node. TCP reachability was available, while the modern hybrid REALITY
ClientHello is large enough to be discarded by some mobile-path middleboxes.

For imported VLESS links containing `pqv`, both platform cores now split only
the first ClientHello into 512-byte TLS records and briefly separate their
writes. The handshake transcript and payload are unchanged; profiles without
`pqv` keep the upstream network path. Native tests cover fragmentation,
payload preservation, and the no-op case. The Android AAR and Windows core were
rebuilt from the exact pinned Mihomo source plus four owned patches. No customer
subscription, key, UUID, endpoint, or raw configuration is stored in the repo.

Local native verification and reproducible Android/Windows core builds pass.
Workspace, application packaging, protected CI publication, online feed checks,
and the owner's end-to-end device smoke remain release gates.

Canonical status: `docs/DEV_RELEASE_READINESS_0.2.41-dev.17.md`.

## PREVIOUS HANDOFF — 2026-09-20, dev.16 modern REALITY candidate

The `v0.2.41-dev.16` candidate added the modern REALITY client version,
ML-DSA-65 verification, X25519/ML-KEM support, and the Chrome fingerprint on
Windows and Android. Publication passed, but the owner's device still timed out
before REALITY authentication.

## PREVIOUS HANDOFF — 2026-09-19, dev.15 connection-hardening candidate

The `v0.2.41-dev.15` source candidate is prepared locally in the isolated
`codex/windows-regression` worktree. The dirty main checkout remains untouched.
The reported `dev.14` screenshot proved two independent states: the selector UI
had moved to the requested node while established `Slave-NL2` sessions remained,
and new dials to the requested endpoint timed out.

Implemented for both platforms:

- Selector updates activate the new target before closing all tracked sessions.
  Failures restore the previous engine profile and persisted selection, and the
  renderer commits the visible choice only after platform acceptance.
- Android resets a saved node missing from refreshed subscriptions to
  `SLAVE-AUTO` before compiling/starting Mihomo. Native selector and
  close-connections failures are no longer swallowed.
- REALITY validation accepts canonical Xray 43-character base64url public keys
  and limits short IDs to the official eight-byte maximum.
- A REALITY node that requests X25519/ML-KEM forces `client-fingerprint: chrome`
  even when global uTLS rotation requested another fingerprint. Current Mihomo
  interop evidence says only that profile supplies the required key share in
  the compatible order.
- Windows and Android share privacy-safe classification for VLESS encryption,
  selector, REALITY, flow, TLS, authentication, DNS, refused, unreachable,
  reset, timeout, and TUN failures. Raw engine lines are not emitted to the UI.
- The dashboard and Servers page now expose one consistent Auto action, allow a
  node to be selected while disconnected, disable desktop autobalancing before
  a manual choice, and label the saved choice separately from the node actually
  carrying traffic. The unfinished Xray engine option is hidden; stale persisted
  Xray selections recover to Mihomo.

Local verification passes: strict lint; workspace typecheck 24/24; config
43/43; core 79/79; runtime 43/43; Windows renderer 38/38; Windows lifecycle
63/63; boundaries 299/299; generated Mihomo configs 8/8; Windows production
build and local `dev.15` Setup/Portable packaging; packaged-runtime verification
for 33 dependencies, native SQLite, engine resources, and compiled-file parity;
and `git diff --check`. Local executables are unsigned. The build host has no
Java runtime, so Kotlin/Gradle compilation remains a protected-CI gate.

Independent endpoint preflight on this host resolved one IPv4 record but got
zero successful TCP connections in three attempts to the configured port. This
matches the reported timeout and means a successful live test requires a network
where the endpoint is reachable; it is not evidence of another selector bug.

Official Mihomo documentation still disclaims general Xray `v26.7.11+` REALITY
compatibility. Full `pqv`/ML-DSA-65 verification remains unsupported by the
bundled core. No user key material was copied into source, tests, docs, or logs.

No commit, push, tag, CI build, release, installed-client replacement, or server
change was performed. Next boundary: review this candidate, then commit/tag
`v0.2.41-dev.15`, run protected Android and Windows release CI, install on the
reporting device, and verify both stale-session removal and fresh traffic.

Canonical status: `docs/DEV_RELEASE_READINESS_0.2.41-dev.15.md`.

## PREVIOUS HANDOFF — 2026-09-14, v0.2.41-dev.14 release

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
