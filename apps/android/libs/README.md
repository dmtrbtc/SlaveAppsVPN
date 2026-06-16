# Prebuilt native libraries

## clashbox.aar

mihomo (Clash.Meta) compiled as an Android `.aar` via `gomobile bind`, wrapped by
the thin `clashbox` package (`apps/android/clashbox-src/clashbox.go`). mihomo is
used (not sing-box's libbox) because it supports VLESS Encryption / REALITY incl.
post-quantum (ML-KEM-768). Pre-built and committed so CI doesn't rebuild on every
push (the bind requires Go + Android NDK).

| Property | Value |
|---|---|
| Source | https://github.com/MetaCubeX/mihomo `Alpha` @ `2c6ff72` (2026-06-15) |
| Build cmd | `gomobile bind -target=android/arm64,android/arm -androidapi=21 -javapkg=com.slavevpn.clash -tags=cmfa,with_gvisor -o clashbox.aar ./clashbox` |
| Go version | 1.26.3 |
| Targets | arm64-v8a + armeabi-v7a (covers all real phones; x86/x86_64 omitted) |
| License | GPL-3.0 (from mihomo) |
| Size | ~59 MB |

The exported Go API (Clashbox / LogHandler / Protector) is consumed by
`apps/android/sample-native/SlaveVpnPlugin/ClashBridge.kt`. Keeping `clashbox.go`
stable across mihomo bumps keeps that Kotlin bridge compatible.

## Rebuild

```powershell
# Prereqs: JDK 21, Android NDK 26+, Go 1.26, standard gomobile (golang.org/x/mobile)
# mihomo cloned to E:\dev\src\mihomo on the Alpha branch with clashbox/ copied in.
# See docs/ANDROID_SETUP.md and apps/android/clashbox-src/build-clashbox.ps1
pwsh apps/android/clashbox-src/build-clashbox.ps1
cp E:\dev\src\mihomo\clashbox.aar apps\android\libs\clashbox.aar
```

To bump mihomo: `git -C E:\dev\src\mihomo fetch origin Alpha && git reset --hard origin/Alpha`,
re-copy `clashbox.go`, `go get golang.org/x/mobile/bind`, then run the build script.
After rebuild, commit the new `clashbox.aar` and update the commit/version note above.

## GPL note

Bundling `clashbox.aar` (mihomo, GPL-3.0) as an `.aar` dependency requires the
Android build to be distributed under GPL-3.0-compatible terms. The Windows build
is unaffected — it spawns `mihomo.exe` as a separate process (not linking).
