# Codex state

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
