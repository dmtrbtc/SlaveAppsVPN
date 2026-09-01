# Android node latency and subscription priority verification

Date: 2026-08-31. Branch: `codex/android-native-node-latency`.

## Scope

- Replace direct endpoint timing with Mihomo native URLTest measurements.
- Show unavailable node measurements as `—`.
- Prevent repeated imports of the same subscription source.
- Collapse already persisted duplicate sources on first load.
- Persist an explicit source priority and expose up/down controls in the
  subscriptions screen.
- Apply the same priority to shared node aggregation, Android and Windows.

Subscription identity uses the source type plus normalized trimmed input. URL
fragments are ignored because they are not sent to the subscription server.
Raw inputs remain in their existing protected/local stores and are never added
to subscription metadata or logs.

## Automated checks

- Core tests: **52/52**.
- Renderer tests: **21/21**.
- Workspace typecheck: **24/24** tasks.
- Architecture boundaries: **295/295** checks.
- Workspace lint: successful.
- Windows production bundle: successful.
- Android `lintDebug` and `assembleDebug`: successful.
- `git diff --check`: clean.

New tests cover URL source identity, stable legacy-priority migration, exact
reorder validation, duplicate-source collapse, and the winning source for an
identical node after priority changes. Android latency tests cover disconnected
state, successful native URLTest, timeout/error handling and invalid values.

## Physical-device verification

- Device: Xiaomi 23117RA68G (`emerald`), Android 16.
- Side-by-side package: `com.slavevpn.app.dev`.
- Version: `0.2.41-dev.subpriority1`, versionCode `20260840`.
- APK SHA-256:
  `a9fc19982260d7106954dc2f9dc30d1284067c388ecf1817d96aa521b3dd0036`.
- APK Signature Scheme v2 verified with the Android debug certificate.
- Production remained `com.slavevpn.app` `0.2.41-dev.8`, versionCode `205`,
  with its `SlaveVpnService` still foreground.

Latency values observed through the running Mihomo core changed from the old
endpoint timings (for example about 1679 ms) to realistic URLTest results:
`Slave-PL` 42 ms, `Slave-NL2` 70-72 ms and `Slave-NL 21` 68 ms. A node whose
URLTest failed displayed `—`. No Android runtime crash was recorded.

The persisted Android store was exercised without printing subscription URLs:

1. Re-importing its existing URL returned `created=false`; the entry count
   remained one.
2. Two temporary duplicates were injected into the dev store. The real list
   operation migrated `3 -> 1`, removed both duplicate input keys and retained
   priority 10.
3. A temporary local fixture was moved above the real source. The returned
   order was priority 10 then 20. Removing the fixture restored one source with
   priority 10.
4. The rendered subscriptions page contained the priority label, explanatory
   text, and both up/down controls. The temporary fixture was removed.

## End state

The production VPN remained connected and unchanged. The side-by-side debug APK
remains installed for visual regression checks. The two implementation commits
are local until their branch is explicitly pushed and reviewed.
