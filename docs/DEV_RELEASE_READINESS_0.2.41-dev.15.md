# SLAVE VPN v0.2.41-dev.15 — Dev release readiness

Status date: 2026-09-19  
Branch: `codex/windows-regression`  
Base: published `v0.2.41-dev.14` (`66650db`)  
Publication status: **source candidate prepared; Android CI and device smoke required**

## Verified locally

- Strict lint passes with zero warnings; workspace typecheck is 24/24.
- Config tests 43/43, core 79/79, runtime 43/43.
- Windows renderer 38/38 and lifecycle 63/63.
- Architecture boundaries 299/299; generated Mihomo configurations 8/8 on
  bundled Mihomo v1.19.30.
- Windows production build and local packaging produced the exact `dev.15`
  Setup, Portable, blockmap, and `latest.yml`. Packaged-runtime verification
  passed for 33 dependencies, lifecycle code, compiled-file parity, native
  SQLite, and bundled engine resources. Local executables are unsigned, as
  expected; CI signatures remain mandatory publication evidence.
- Release source versions, changelog, notes, and signing guards are consistent
  for `v0.2.41-dev.15`.
- From this build host, the reported endpoint resolved to one IPv4 address but
  accepted zero of three TCP connection attempts on its configured port. This
  confirms that the observed timeout cannot currently be closed by client code
  alone; it does not replace testing from the user's mobile network.

## Candidate changes

- Selector updates are transactional on both platforms and close stale sessions
  only after the new target is active.
- Removed Android selections fall back to `SLAVE-AUTO` before compilation.
- Modern Xray REALITY public keys and short IDs are validated correctly.
- X25519/ML-KEM REALITY nodes force the currently compatible `chrome`
  fingerprint.
- Both platforms expose the same privacy-safe connection-failure taxonomy.
- Manual/Auto selection is consistent across the dashboard and server list,
  can be set while disconnected, and visibly separates desired and active nodes.

## Remaining publication gates

- Build Android Lint, debug APK, and release-signed APK in protected CI. This
  host has no Java runtime, so Kotlin/Gradle compilation was not performed
  locally.
- Verify the pinned Android production signing certificate and version code
  `915` in the exact tagged APK.
- Build and inspect signed Windows Setup, Portable, blockmap, `latest.yml`, and
  checksums from the exact tag in protected CI.
- Install on the reporting Android device, switch from a known-good node to the
  reported node, confirm that old sessions disappear, and repeat on a network
  where the endpoint port is reachable.
- Verify published assets, hashes, metadata, and Dev update-feed discovery
  before calling the prerelease complete.

Promotion to Stable is not part of this stage.
