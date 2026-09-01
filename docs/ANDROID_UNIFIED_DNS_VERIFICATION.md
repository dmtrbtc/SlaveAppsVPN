# Android unified DNS verification

Date: 2026-09-01. Branch: `codex/android-unified-dns`.

## Scope

- Make Android consume the shared `DnsProfile` selected by `dnsPreset`,
  `dnsStrategy`, `customDnsProfile` and the cross-platform DoH provider.
- Preserve Android-only safety without rebuilding a second DNS domain model:
  proxy node anti-loop rules, RU-direct resolution in bypass-style modes,
  fake-IP exclusions for direct destinations and TCP/443 defaults for built-in
  DoH profiles.
- Enable shared advanced DNS controls on Android: custom resolvers, per-domain
  policies and prefetch domains.
- Keep advanced overlays when switching between built-in presets.
- Apply an explicit IPv6 strategy to both Mihomo's global and DNS-level flags.
- Default old/missing Android settings to `secure` + `prefer_ipv4`.

## Architecture boundary

Platform storage remains in the Android bridge. It supplies typed settings to
`createAndroidEngineConfigProvider`; Core resolves the engine-neutral profile,
adds the Android policy decorator and passes it to the single
`MihomoDnsCompiler` used by Windows. The renderer uses the same DNS API and
`DnsAdvancedSection` on both platforms.

## Automated verification

- DNS tests: **6/6**.
- Config tests: **38/38** (22 parser/rotation + 16 Mihomo/Android routing).
- Core tests: **55/55**.
- Renderer tests: **21/21**.
- Workspace typecheck: **24/24** tasks.
- Architecture boundaries: **295/295** checks.
- Workspace lint: successful.
- Real Mihomo validation: **8/8** generated configs accepted by v1.19.30,
  including the exact advanced Android profile used for device smoke.
- Windows production renderer/main/preload build: successful.
- Android Capacitor sync, `lintDebug` and `assembleDebug`: successful.
- `git diff --check`: clean.

## Device verification

Device: Xiaomi 23117RA68G (`emerald`), Android 16.

- Side-by-side package: `com.slavevpn.app.dev`.
- Version: `0.2.41-dev.dns1`, versionCode `20260901`.
- APK SHA-256:
  `89af1fae84aa0f57ec45f0fd913a9677a48971b8e23a8bd32e84ef679ea45e69`.
- Production remained `com.slavevpn.app` `0.2.41-dev.9`, versionCode `207`.

The real Android WebView displayed all four shared presets, all four strategies
and the three advanced sections (custom resolvers, per-domain policy and
prefetch). A reversible bridge smoke changed only debug DNS fields:

1. `secure / prefer_ipv4` -> `minimal / ipv6_only`;
2. the returned minimal profile had `fakeIpEnabled=false`;
3. one custom DoH/H3 resolver, one per-domain rule and one prefetch domain were
   written and read back;
4. the original preset, strategy and full custom profile were restored exactly.

The same temporary profile started the native VPN successfully. Android
reported a validated `WIFI|VPN` network on `tun0`; the cached native config was
checked without printing YAML or subscription data and contained:

- `enhanced-mode: redir-host`;
- custom DoH/H3 resolver;
- per-domain rule and prefetch block;
- two `ipv6: true` markers (global and DNS-level).

No Android runtime crash or Mihomo error was recorded. Cleanup disconnected and
force-stopped the debug package, restored its original DNS settings and returned
focus to production. Production VPN was off before the test and remained off.
