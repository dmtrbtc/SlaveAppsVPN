# Prebuilt native libraries

## `clashbox.aar`

Mihomo (Clash.Meta) is embedded as an Android AAR through `gomobile bind` and
the thin wrapper in `apps/android/clashbox-src/clashbox.go`. The AAR is committed
so ordinary application builds do not need Go, gomobile, or the Android NDK.

| Property | Value |
| --- | --- |
| Source | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) tag `v1.19.30`, commit `ac017cdd246ce8bd547653d927e7bf77d7ee73d5`, plus owned patches in `patches/mihomo` |
| Xray source | [XTLS/Xray-core](https://github.com/XTLS/Xray-core) commit `676eaf66f8f0` |
| Embedded version | `v1.19.30-slave.5-xray` |
| SHA-256 | `cfd1b86b7a0586ab4b8fc32ac6057867457da3783d4a66269467bc5296278cbe` |
| Go | `1.27.3` (`GOTOOLCHAIN=go1.27.3+auto`) |
| gomobile / gobind | `golang.org/x/mobile@v0.0.0-20261011034528-197770444867` |
| Android toolchain | JDK 21, NDK `26.1.10909125`, minimum API 24 |
| Build tags | `cmfa,with_gvisor,xray` |
| Targets | `arm64-v8a`, `armeabi-v7a` |
| Size | 57601475 bytes |
| License | GPL-3.0 (inherited from Mihomo) |

The generated Java package is `com.slavevpn.clash.clashbox`. Its exported
`Clashbox`, `LogHandler`, and `Protector` APIs are consumed by
`apps/android/sample-native/SlaveVpnPlugin/ClashBridge.kt`.

## Rebuild

Clone the exact upstream tag into any clean directory:

```powershell
git clone --branch v1.19.30 --depth 1 https://github.com/MetaCubeX/mihomo.git E:\path\to\mihomo-v1.19.30
```

For this release, export that commit, apply the patches in
`patches/mihomo` in order, and copy `clashbox.go` and `xray.go` from
`apps/android/clashbox-src` into a `clashbox` directory in the exported
source. With the toolchain from the table, run the following there.

```powershell
go get github.com/xtls/xray-core@v1.260327.1-0.20261109052709-676eaf66f8f0 golang.org/x/mobile@v0.0.0-20261011034528-197770444867
go mod edit '-dropreplace=google.golang.org/protobuf'
go build -mod=mod -tags=xray -ldflags=-checklinkname=0 ./clashbox
gomobile bind '-target=android/arm64,android/arm' '-androidapi=24' `
  '-javapkg=com.slavevpn.clash' '-tags=cmfa,with_gvisor,xray' -trimpath `
  '-ldflags=-checklinkname=0 -extldflags=-Wl,-z,max-page-size=16384 -X github.com/metacubex/mihomo/constant.Version=v1.19.30-slave.5-xray -s -w -buildid=' `
  -o clashbox.aar ./clashbox
```

The checked build script also provides a separate `-Candidate -EmbeddedXray`
mode with a different minimum Android API and a fixed build timestamp.
Supply `-OutputPath` when using it.

## GPL note

Distributing an Android application linked with this AAR must comply with
Mihomo's GPL-3.0 license, including the corresponding-source obligations. The
Windows application launches `mihomo.exe` as a separate process instead of
linking it into the application.
