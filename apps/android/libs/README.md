# Prebuilt native libraries

## `clashbox.aar`

Mihomo (Clash.Meta) is embedded as an Android AAR through `gomobile bind` and
the thin wrapper in `apps/android/clashbox-src/clashbox.go`. The AAR is committed
so ordinary application builds do not need Go, gomobile, or the Android NDK.

| Property | Value |
| --- | --- |
| Source | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) tag `v1.19.30`, commit `ac017cdd246ce8bd547653d927e7bf77d7ee73d5`, plus owned patches in `patches/mihomo` |
| SHA-256 | `66877689dc73edf5dbabf289f1bbd1240e73c00f4e95c61d10bc3f253f4e7424` |
| Go | `1.26.3` (`GOTOOLCHAIN=go1.26.3+auto`) |
| gomobile / gobind | `golang.org/x/mobile@v0.0.0-20260529142300-ecb4cd65260a` |
| Android toolchain | JDK 21, NDK `26.1.10909125`, minimum API 21 |
| Build tags | `cmfa,with_gvisor` |
| Targets | `arm64-v8a`, `armeabi-v7a` |
| Size | 36,840,603 bytes (35.13 MiB) |
| License | GPL-3.0 (inherited from Mihomo) |

The generated Java package is `com.slavevpn.clash.clashbox`. Its exported
`Clashbox`, `LogHandler`, and `Protector` APIs are consumed by
`apps/android/sample-native/SlaveVpnPlugin/ClashBridge.kt`.

## Rebuild

Clone the exact upstream tag into any clean directory:

```powershell
git clone --branch v1.19.30 --depth 1 https://github.com/MetaCubeX/mihomo.git E:\path\to\mihomo-v1.19.30
```

Then run the checked build from the monorepo root:

```powershell
pwsh apps/android/clashbox-src/build-clashbox.ps1 `
  -MihomoSource E:\path\to\mihomo-v1.19.30
```

Tool locations can be supplied with the script parameters or the
`SLAVE_GO_ROOT`, `SLAVE_GO_PATH`, `SLAVE_GOMOBILE_BIN`, `SLAVE_JAVA_HOME`,
`SLAVE_ANDROID_HOME`, and `SLAVE_ANDROID_NDK_HOME` environment variables.

The script refuses a dirty checkout, a different tag or commit, unpinned
gomobile tools, or the wrong Go toolchain. It exports the verified commit to a
stable temporary path, applies the reviewed patches, fixes the embedded
version/build time, uses `-trimpath` and an empty Go build ID, validates both
Android ABIs and the complete Java API, and only then replaces the committed
AAR. The caller's source checkout is never modified. Two independent clean
checkouts must produce the SHA-256 above.

Go 1.26 gomobile also requires `x/mobile/bind` to be recorded as a tool in the
source module. The build adds the exact revision used by the pinned gomobile and
gobind executables only to the exported temporary module.

## GPL note

Distributing an Android application linked with this AAR must comply with
Mihomo's GPL-3.0 license, including the corresponding-source obligations. The
Windows application launches `mihomo.exe` as a separate process instead of
linking it into the application.
