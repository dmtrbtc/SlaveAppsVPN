# SLAVE VPN v0.2.41-dev.16 — Dev release readiness

Status date: 2026-09-20
Branch: `codex/windows-regression`
Base: published `v0.2.41-dev.15` (`664aed1`)
Publication status: **source and native artifacts verified locally; protected CI and device smoke required**

## Verified locally

- Config tests 45/45; Windows renderer 38/38 and lifecycle 63/63.
- Workspace typecheck 24/24, boundaries 299/299, and strict lint pass.
- Eight generated Mihomo configuration scenarios pass on the patched Windows
  core, including `mldsa65-verify`.
- Native Mihomo tests cover the modern REALITY client version, valid and invalid
  ML-DSA-65 signatures, and malformed verification keys.
- Windows core builds from the exact upstream tag plus owned patches and starts
  as `v1.19.30-slave.1`.
- Android AAR contains both ARM ABIs and the complete Java API. Two independent
  clean builds produced the same pinned SHA-256.
- Android Lint and debug APK assembly pass with the rebuilt AAR.

## Candidate changes

- Advertise REALITY client version `26.3.27` instead of Mihomo's legacy `1.8.2`.
- Preserve `pqv` as `reality-opts.mldsa65-verify`, validate its exact decoded
  size, and verify the ML-DSA-65 signature during the REALITY handshake.
- Retain X25519/ML-KEM support and the compatible Chrome fingerprint.
- Build both native cores from the same reviewed patch set and immutable Mihomo
  source commit.

## Remaining publication gates

- Build signed Android and Windows artifacts from the exact immutable tag in
  protected GitHub Actions.
- Verify release asset hashes, `latest.yml`, Android version code and production
  signing certificate after publication.
- Install on the reporting device and obtain a successful end-to-end REALITY
  authentication and traffic test with the owner's subscription.

Promotion to Stable is not part of this stage.
