# SLAVE VPN v0.2.41-dev.17 — Dev release readiness

Status date: 2026-09-20
Branch: `codex/windows-regression`
Base: published `v0.2.41-dev.16` (`7628763`)
Publication status: **source and native artifacts verified locally; protected CI and device smoke required**

## Verified locally

- Config tests 45/45; Windows renderer 38/38 and lifecycle 63/63.
- Workspace typecheck 24/24, boundaries 299/299, and strict lint pass.
- Eight generated Mihomo configuration scenarios pass on the patched Windows
  core, including the opt-in flag emitted only for `pqv` profiles.
- Native Mihomo tests verify TLS-record fragmentation, payload preservation,
  and the unchanged path for non-ClientHello records.
- The patch applies cleanly to the exact pinned Mihomo source and both affected
  native packages pass their Go tests.
- Windows core builds from the reviewed patch set and starts as
  `v1.19.30-slave.1`.
- Android AAR contains both ARM ABIs and the complete Java API; repeated clean
  builds produce the pinned SHA-256.
- Android Lint and debug APK assembly pass with the rebuilt AAR.
- Windows Setup/Portable packaging and packaged-runtime verification pass.

## Candidate changes

- Split only the first oversized hybrid REALITY ClientHello into 512-byte TLS
  records with a short delay that prevents network-stack coalescing.
- Enable this compatibility path only when an imported VLESS link supplies
  `pqv`; all other profiles retain upstream behavior.
- Ship the same reviewed Mihomo patch set on Windows and Android.

## Remaining publication gates

- Build signed Android and Windows artifacts from the exact immutable tag in
  protected GitHub Actions.
- Verify release assets, hashes, update feed, Android version code, and signing
  certificate after publication.
- Obtain a successful end-to-end test with the owner's key on mobile and Wi-Fi.

Promotion to Stable is not part of this stage.
