# Prebuilt native libraries

## `clashbox.aar`

Mihomo (Clash.Meta) is embedded as an Android AAR through `gomobile bind` and
the thin wrapper in `apps/android/clashbox-src/clashbox.go`. The AAR is committed
so ordinary application builds do not need Go, gomobile, or the Android NDK.

| Property | Value |
| --- | --- |
| Source | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) tag `v1.19.30`, commit `ac017cdd246ce8bd547653d927e7bf77d7ee73d5`, plus owned patches in `patches/mihomo` |
| Embedded version | `v1.19.30-slave.5-xray` |
| SHA-256 | `cfd1b86b7a0586ab4b8fc32ac6057867457da3783d4a66269467bc5296278cbe` |
| Go | `1.27.3` (verified in the shipped ARM64 library's build info) |
| gomobile / gobind | `golang.org/x/mobile@v0.0.0-20261011034528-197770444867` |
| Embedded Xray | `v1.260327.1-0.20261109052709-676eaf66f8f0`, used for TCP FinalMask |
| Android toolchain | JDK 21, NDK `26.1.10909125`, minimum API 21 |
| Build tags | `cmfa,with_gvisor,xray` |
| Targets | `arm64-v8a`, `armeabi-v7a` |
| Size | 57,601,475 bytes (54.93 MiB) |
| License | GPL-3.0 (inherited from Mihomo) |

The generated Java package is `com.slavevpn.clash.clashbox`. Its exported
`Clashbox`, `LogHandler`, and `Protector` APIs are consumed by
`apps/android/sample-native/SlaveVpnPlugin/ClashBridge.kt`.

## Rebuild

Dev.3 reuses the accepted Dev.2 AAR, rather than rebuilding the core. Its SHA-256
is checked by `scripts/validate-android-core.mjs` and the Android CI workflow.
The Kotlin handover/TUN fixes do not change these native libraries.

Clone the exact upstream tag into any clean directory:

```powershell
git clone --branch v1.19.30 --depth 1 https://github.com/MetaCubeX/mihomo.git E:\path\to\mihomo-v1.19.30
```

Then run the checked build from the monorepo root:

```powershell
pwsh apps/android/clashbox-src/build-clashbox.ps1 `
  -MihomoSource E:\path\to\mihomo-v1.19.30 `
  -Candidate -EmbeddedXray `
  -OutputPath E:\SlaveApps\tmp\clashbox-rebuilt-candidate.aar
```

Tool locations can be supplied with the script parameters or the
`SLAVE_GO_ROOT`, `SLAVE_GO_PATH`, `SLAVE_GOMOBILE_BIN`, `SLAVE_JAVA_HOME`,
`SLAVE_ANDROID_HOME`, and `SLAVE_ANDROID_NDK_HOME` environment variables.

The script refuses a dirty checkout, a different tag or commit, unpinned
gomobile tools, or the wrong Go toolchain. It exports the verified commit to a
stable temporary path, applies the reviewed patches, fixes the embedded
version/build time, uses `-trimpath` and an empty Go build ID, validates both
Android ABIs and the complete Java API, and only then writes the
AAR at the explicit candidate path. The caller's source checkout is never
modified. Compare candidate build metadata, APIs and both ABIs before promotion;
the reused Dev.2 artifact is the accepted reference for this release. A new
two-build reproducibility check of the embedded-Xray recipe was not performed.

Without `-EmbeddedXray`, the script builds the older standalone `slave.4`
variant. Do not replace the accepted AAR with that output: FinalMask support
would be lost, and the release checksum guard will reject it.

The gomobile build also requires `x/mobile/bind` to be recorded as a tool in the
source module. The build adds the exact revision used by the pinned gomobile and
gobind executables only to the exported temporary module.

## GPL note

Distributing an Android application linked with this AAR must comply with
Mihomo's GPL-3.0 license, including the corresponding-source obligations. The
Windows application launches `mihomo.exe` as a separate process instead of
linking it into the application.
