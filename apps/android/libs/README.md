# Prebuilt native libraries

## libbox.aar

Sing-box mobile bindings (libbox) compiled via `gomobile bind`. Pre-built and committed here so CI doesn't need to rebuild on every push (compile takes ~30 min and requires Go + Android NDK).

| Property | Value |
|---|---|
| Source | https://github.com/SagerNet/sing-box `v1.11.15` `experimental/libbox` |
| Build cmd | `gomobile bind -androidapi=21 -javapkg=io.nekohasekai -libname=box -tags=with_clash_api,with_gvisor,with_quic,with_wireguard,with_utls -target=android/arm64,android/arm ./experimental/libbox` |
| Go version | 1.24.7 |
| Targets | arm64-v8a + armeabi-v7a |
| License | GPL-3.0 (from sing-box) |
| Size | ~36 MB |

## Rebuild

To regenerate (e.g. to bump sing-box version):

```bash
# Prereqs: JDK 21, Android NDK 26+, Go 1.24
# See docs/ANDROID_SETUP.md
bash scripts/build-libbox.sh
```

After rebuild, commit the new `libbox.aar` and bump the version note above.

## GPL note

Bundling `libbox.aar` as an .aar dependency requires that our Android build
also be GPL-3.0 (or distribute under compatible terms). Our Windows build
is unaffected — it uses sing-box.exe spawned as a separate process,
which is NOT considered linking under GPL.
