# Android CoreFacade probe verification

Date: 2026-08-26. Branch: `codex/core-facade-probe-all`.

## Tested artifact

- Device: Xiaomi 23117RA68G, Android 16, USB ADB.
- Debug package: `com.slavevpn.app.dev`.
- Final version: `0.2.41-dev.probe2`, versionCode `20260829`.
- APK SHA-256: `ac65c84aad57aaba6b7e0a87dd0b4df21bb7626e5c1bc447d64e4db0a555e289`.
- APK signature verified; ARM64 and ARMv7 libraries present.
- Production `com.slavevpn.app` remains `0.2.41-dev.5`, versionCode `195`;
  its installation timestamp did not change. No subscription/account changes.

## Automated checks

- `pnpm --filter @slave-vpn/core test`: 29 passed.
- `pnpm --filter @slave-vpn/windows test:queries`: 2 passed.
- `pnpm typecheck`: 24 tasks passed.
- `pnpm validate:boundaries`: 295 checks passed.
- `node scripts/validate-mihomo-configs.mjs`: 6 configurations passed on
  Mihomo `v1.19.30`.
- Windows production bundle built successfully.
- Android `lintDebug` and `assembleDebug`: successful.
- `git diff --check`: clean.

## Physical-device results

1. After a cold start with VPN disconnected, simultaneous `vpn.probeAll` and
   `servers.probe` calls both completed successfully. Two independent listeners
   each received exactly five identical per-node results for five distinct
   targets. No duplicate events. The state remained disconnected, with no TUN
   interface or running `SlaveVpnService` observed.
2. The Servers screen auto-probe populated all five latency badges. Clicking
   its refresh button updated all five values and re-enabled the button.
3. With VPN connected, both API entry points and the refresh button passed the
   same checks. The connection remained active. Android reported a validated
   VPN network with `tun0`.
4. A separate Mihomo URL test through a proxy to the public 204 endpoint
   succeeded with a 57 ms delay. This checks proxy connectivity separately from
   the edge-latency measurements.
5. The final debug process produced no `AndroidRuntime:E` / `libc:F` entries in
   the checked logcat buffers.

## Bug found and fixed during the device test

On `probe1`, after a VPN transition, WebView reported `navigator.onLine=false`
while native network requests worked. React Query paused `servers` refetch, so
the refresh handler never reached its subsequent probe call. Two button tests
produced zero latency events within 15 seconds, although direct probe calls
completed for all five targets.

The fix sets `networkMode: 'always'` only for the `servers` query key. The bridge
still returns actual network failures; no global online-state override is used.
Both new query tests reproduced the pause before the fix and passed afterward.
They are included in the CI unit-test job.

On the physical device with `probe2`, a temporary synthetic offline event and
`navigator.onLine=false` override reproduced the UI condition without disabling
native networking. The refresh button delivered all five results and became
enabled again. The original navigator property/event state was restored.

## Observations and limits

- The first startup briefly displayed a device-limit placeholder, followed by a
  normal five-node subscription without account changes. This report does not
  establish the provider-side reason or certify placeholder handling.
- A probe immediately after disconnect failed resolving the subscription host;
  a subsequent request succeeded with VPN still disconnected. Subscription
  fetching remains a prerequisite for probing. Cached targets / reconnect-time
  fetch resilience are a separate follow-up, not implemented by this migration.
- This report records the historical `probe2` HTTP/TLS edge-latency behavior.
  It was superseded on 2026-08-31 by native Mihomo URLTest measurements through
  each node; see `ANDROID_NODE_LATENCY_SUBSCRIPTION_PRIORITY_VERIFICATION.md`.

## End state

The test VPN was disconnected, no TUN remained, and the local WebView ADB
forward was removed. `probe2` remains installed beside unchanged production
`dev.5`. Changes are local: no commit, push, PR or release was made by this test.
