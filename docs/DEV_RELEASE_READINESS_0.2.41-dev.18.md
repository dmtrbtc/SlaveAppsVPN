# SLAVE VPN v0.2.41-dev.18 — Dev release readiness

Status date: 2026-09-20
Branch: `codex/windows-regression`
Base: published `v0.2.41-dev.17` (`df3e9a4`)
Publication status: **local protocol regression fixed; protected CI and owner device smoke required**

## Root cause

The dev.17 client completed parsing, selection, DNS resolution, and TCP dialing,
but current Xray servers may reject its REALITY session before authentication
because it advertised client version `26.3.27`. A server policy requiring
`minClientVer=26.9.9` produced the same silent timeout/EOF pattern as the field
report.

## Verified locally

- Strict lint, workspace typecheck 24/24, and architecture boundaries 299/299
  pass.
- Config 45/45, core 79/79, DNS 6/6, routing 8/8, runtime 43/43,
  Windows renderer 38/38, and Windows lifecycle 63/63 tests pass.
- Eight generated Mihomo configuration scenarios validate on the patched core.
- A local Xray 26.9.9 server rejects the old version and records the decrypted
  session version as `26.3.27`.
- The corrected packaged Mihomo client authenticates successfully when the
  server requires `26.9.9`, with hybrid X25519/ML-KEM, ML-DSA-65, and fragmented
  ClientHello enabled together.
- Native Mihomo tests for REALITY session construction and transport pass.
- Windows core was rebuilt from the reviewed patch set; SHA-256:
  `ea12f23c38ffd66a6d503fafb8d99592d2d64b79f3403393e02383aa9c493027`.
- Android AAR was rebuilt twice from the pinned source, contains both ARM ABIs,
  preserves the expected Java API, and has SHA-256:
  `66877689dc73edf5dbabf289f1bbd1240e73c00f4e95c61d10bc3f253f4e7424`.
- Android Lint and debug APK assembly pass.
- Windows Setup/Portable packaging and packaged-runtime verification pass for
  all 33 runtime dependencies, native SQLite, engine resources, and compiled
  file parity.
- Release source, version, notes, and signing guards are internally consistent.

## Remaining publication gates

- Build signed Android and Windows artifacts from the exact immutable tag in
  protected GitHub Actions.
- Verify release assets, hashes, update metadata, Android version code, and
  signing certificate after publication.
- Obtain an end-to-end test with the owner's key on mobile and Wi-Fi.

Promotion to Stable is not part of this stage.
