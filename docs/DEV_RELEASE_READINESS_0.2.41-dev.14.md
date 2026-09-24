# SLAVE VPN v0.2.41-dev.14 — Dev release readiness

Status date: 2026-09-14  
Branch: `codex/windows-regression`  
Base: `v0.2.41-dev.13` (`9bdfeaf`)  
Publication status: **ready to tag**

## Verified before tag

- Typecheck: 24/24 tasks.
- Strict lint: zero warnings.
- Config: 39/39; core: 66/66; runtime: 42/42.
- Routing: 8/8; DNS: 6/6.
- Windows renderer: 32/32; lifecycle: 62/62.
- Architecture boundaries: 299/299.
- Mihomo v1.19.30 generated configurations: 8/8.
- Windows packaged-runtime verification passed on the stable-version rehearsal.
- Android Lint, debug assembly, unsigned release assembly, both ARM ABIs, web
  assets, and native `go.LoadJNI` bridge passed on the stable-version rehearsal.
- The previous production `extract-zip` path is no longer reachable after
  removing the unused `@electron-toolkit/utils` runtime dependency. A fresh
  online registry audit remains a CI/external check.

Exact-version control builds also passed after switching both packages to
`0.2.41-dev.14`:

- Windows Setup, Portable, blockmap, and `latest.yml` were created with the
  correct prerelease version. Local binaries are unsigned; final CI artifacts
  must be checked independently.
- Android debug and unsigned release packages report version name
  `0.2.41-dev.14`, version code 914, contain both supported ABIs, web assets,
  and the native loader. The local release APK is deliberately unsigned; the CI
  release-key build is the publishable artifact.

## Publication gates for this Dev build

- Commit and immutable tag must contain version `0.2.41-dev.14` in both apps.
- Draft release must use `docs/releases/v0.2.41-dev.14.md` and remain marked as
  prerelease.
- Windows CI must build Setup, Portable, blockmap, `latest.yml`, and checksums
  from the exact tag.
- Android CI must build a release-signed APK from the exact tag and pass the
  pinned production certificate check.
- Published assets, hashes, metadata, and Dev update-feed discovery must be
  verified online before this stage is complete.

Promotion to Stable is not part of this stage.
