# WORKLOG — VLESS Encryption (ML-KEM-768 / X25519)

Branch: `feat/vless-encryption`. Goal: support VLESS Encryption ("vlessenc",
post-quantum ML-KEM-768 / X25519) on Windows + Android, connecting to a server
with such an inbound via subscription, for ANY key set.

Reference subscription (HWID-gated): `https://sub.slave-apps.online/<REDACTED-SUB-TOKEN>`
(token kept out of git per secret policy; contains 1 bare-enc node + 2 Reality
nodes). Server confirmed working in Happ + v2RayTun (both Xray-core).

---

## PHASE 0 — RECON (complete)

### Proxy cores in this repo
| Platform | Core | Version | VLESS enc? |
|---|---|---|---|
| Windows (primary) | **mihomo** (Clash.Meta) | **v1.19.25** (go1.26.3) | ✅ **YES** |
| Windows (alt) | sing-box | v1.13.12 | ❌ NO (`json: unknown field "encryption"`) |
| Windows (stub) | xray | — | XrayEngine/XrayConfigCompiler are `throw "not implemented"` stubs; no xray binary bundled |
| Android | sing-box **libbox** | v1.11.15 | ❌ NO (older than desktop 1.13.12 which already lacks it) |

### Decisive experiments (не гадать — все проверено эмпирически)
1. **sing-box 1.13.12 `check`** with a vless outbound carrying `encryption`:
   → `FATAL outbounds[0].encryption: json: unknown field "encryption"`.
   sing-box (this build) does NOT support VLESS encryption. `sing-box generate`
   has no vless/mlkem keypair command either.
2. **mihomo 1.19.25 `-t`** with `encryption: mlkem768x25519plus.native.1rtt.<short>`:
   → `failed to use encryption: empty nfsPKeysBytes` (parsed the MODE, then
   tried to decode the key — "nfsPKeys" is the exact ML-KEM/X25519 VLESS-enc
   terminology). With garbage mode → `invaild vless encryption value: ...`
   (actively validates). ⇒ mihomo really implements VLESS encryption, accepts
   the **Xray prefix order** `mlkem768x25519plus` → pass string VERBATIM, no
   transform needed for mihomo.
3. **Real subscription forms** (HWID header required, else placeholder):
   - clash UA → **Clash YAML** containing the enc node verbatim:
     `encryption: mlkem768x25519plus.native.0rtt.<1610-char key>` on `Slave-EE`.
   - Happ/v2rayNG UA → **XRAY_JSON** array; enc lives in
     `outbounds[].settings.vnext[].users[].encryption`. cfg#0 = bare enc
     (network tcp, security none, flow ""); cfg#1/#2 = Reality, encryption none.
   - sing-box UA → base64 vless:// URIs.
4. **End-to-end Windows pipeline** (real app functions on the real sub):
   `normalizeSubscriptionContent` (clash-yaml passthrough, enc preserved) →
   `generateMihomoConfig` → all 3 proxies kept, enc at full 1622-char length,
   `mihomo -t` = **test successful**.
5. **Runtime 204 ACCEPTANCE (Windows)**: minimal mihomo config with ONLY the
   enc node, `mode: rule`, `rules: [MATCH,P]` (no DIRECT/GLOBAL fallback path):
   `http://www.gstatic.com/generate_204` via mixed-port → **HTTP 204**. The
   1610-char ML-KEM key loaded without `nfsPKeysBytes` error and carried TCP
   traffic. ⇒ post-quantum VLESS handshake succeeds through mihomo.
   (Egress IP equals direct IP because `ee.slave-apps.online` = `64.188.82.186`
   is the same uplink as this host — co-located; the rule-mode 204 is the
   conclusive tunnel proof since no non-proxy egress exists.)

### Conclusion / chosen core
**mihomo is the core.** On Windows VLESS Encryption WORKS TODAY with no core
change because (a) mihomo implements it and (b) our parse→generate pipeline is
field-preserving (`SubscriptionParser` spreads `...p`; `generateMihomoConfig`
dumps `profile.proxies` wholesale; clash-yaml normalize passes through verbatim).

### Gaps found (to implement)
- `uriParser.parseVless` does NOT capture the `encryption` query param → enc
  lost for vless:// / base64 / single-proxy sources (clash-YAML path is fine).
  Also map `type=raw` → tcp.
- No enc-string validation → a truncated/empty key fails silently-ish (mihomo
  says "empty nfsPKeysBytes" only at config-test). Add explicit validation.
- No error classification (network refused/timeout vs crypto/decrypt) and the
  engine doesn't surface mihomo's enc stderr clearly.
- `countProxiesInYaml` mis-counts when a proxy has a huge `encryption:` line →
  cosmetic wrong "N servers" (returned 1 for a 3-node sub). Fix regex.
- HWID: Windows already sends `X-HWID` (subscriptionHeaders.ts). Verify Android.

### ANDROID — BLOCKER (reported, not faked)
Android runs sing-box libbox 1.11.15. sing-box has no working VLESS-encryption
support (1.13.12 desktop already rejects the field). So an enc node CANNOT
connect on Android with the current core. Per the task's BLOCKER rule
("sing-box-ядро без рабочей enc-поддержки"), this is a declared blocker.
Plan for Android this iteration (no faking): detect enc nodes during config
compilation and surface a CLEAR unsupported-error; keep non-enc nodes working.
Forward path (next iteration): swap Android core to a gomobile-built mihomo
(Clash.Meta) lib so the same enc-capable core runs on both platforms.

---

## PHASE 1–5 — IMPLEMENTATION (done)

New shared module `packages/config/src/encryption/vlessEncryption.ts`:
- `parseVlessEncryption` — minimal: handshake + appearance + rtt recognised,
  everything after = opaque verbatim tail (padding + 1..N keys). Never throws.
- `validateVlessEncryption` — fails ONLY on unusable creds (truncated → no key
  = EMPTY_KEY; unknown handshake = UNKNOWN_HANDSHAKE). Valid strings untouched.
- `transformEncryptionForSingbox` — swaps ONLY the handshake prefix block
  (`mlkem768x25519plus` ↔ `x25519mlkem768plus`); appearance/rtt/keys verbatim.
- `isEncryptionValue`, `XRAY_HANDSHAKE`, `SINGBOX_HANDSHAKE`.
Re-exported from `@slave-vpn/config`. 16 unit tests (`node --test`) green:
single/multiple/X25519-only/ML-KEM-only keys, padding, both prefixes, truncated,
unknown, transform, URI capture.

Faithful passthrough (Windows / mihomo — works with NO core change):
- `SubscriptionParser` spreads all fields; `generateMihomoConfig` dumps proxies
  wholesale → `encryption` reaches mihomo verbatim. (verified, see Phase 6)
- `uriParser.parseVless` now captures `encryption` (+ maps `type=raw`→`tcp`) so
  vless:// / base64 / single-proxy sources also carry enc (clash-YAML path was
  already fine).
- `validator.validateVless` runs `validateVlessEncryption` → empty/truncated key
  surfaces as a node error instead of a silent connect fail.
- `normalizer.countProxiesInYaml` rewritten (line scan) — the ~1.6k-char enc
  line used to break the regex and under-count nodes (1 instead of 3). Fixed.

Honest sing-box / Android handling (NOT faked — core can't do enc):
- `compiler/singbox/protocols.compileVless` skips nodes with `encryption` (would
  break sing-box config / connect plaintext to an enc-only server).
- Android `compile-config.ts`: detects enc nodes; if the SELECTED node is enc →
  throws a specific RU error ("VLESS Encryption не поддерживается Android-ядром
  … подключитесь из Windows"); otherwise adds a skip-warning. Non-enc nodes keep
  working.

Error classification (Phase 4):
- `classifyMihomoLogLine_inner` gains a FIRST-checked enc branch (`nfsPKeys`,
  `vless encryption value`) → `proxy.encryption_error` (crypto/keys), distinct
  from network (`connection refused`/`timed out`). mihomo stdout+stderr already
  flow to logs as `logLine` events.
- 404/403 from the subscription now reported as "HWID / лимит устройств" (both
  Windows `SubscriptionUrlSource` and Android `native-fetch`), not "no servers".

HWID (Phase 3): Windows already sends `X-HWID` (MachineGuid-derived,
subscriptionHeaders.ts); Android sends stable `x-hwid` + device headers
(device-id.ts). Both verified.

## PHASE 6 — ACCEPTANCE (Windows: PASS)

1. **Semantic diff** our mihomo config vs v2RayTun XRAY_JSON reference, enc node:
   server / port / uuid / flow / network / security — ALL MATCH;
   `encryption` byte-identical (both 1610 chars, same head & tail). ✅
2. **204 test (Windows runtime)**: mihomo with ONLY the enc node, `mode: rule`,
   `rules: [MATCH,P]` (no DIRECT/GLOBAL escape) → `gstatic /generate_204` via
   the mixed-port proxy returned **HTTP 204**; the 1610-char ML-KEM key loaded
   without error and carried TCP. ✅
3. **Full app pipeline**: real sub → `normalizeSubscriptionContent` (enc kept,
   count now correct = 3) → `generateMihomoConfig` (enc 1622-char line) →
   `mihomo -t` = **test successful**. ✅
4. **Subscription-driven w/ HWID**: fetch sends `X-HWID`; Remnawave returned the
   enc node in the Clash form. ✅
5. **Android**: live enc connect NOT possible (core blocker, below). APK builds;
   enc nodes produce a precise unsupported-error. Live non-enc connect on Android
   requires manual device verification (not claimed as passed).

## ANDROID — BLOCKER (reported honestly)
sing-box (libbox 1.11.15 on device; even desktop 1.13.12) has NO VLESS-encryption
support. An enc node cannot connect on Android with the current core. This is the
task's declared blocker ("sing-box-ядро без рабочей enc-поддержки"). Delivered
instead: precise unsupported-error + non-enc nodes keep working. Forward path:
build a gomobile mihomo (Clash.Meta) core for Android so the same enc-capable
core runs on both platforms (large, next iteration).

---

## PHASE 7 — GIT / PR (done)
- Branch `feat/vless-encryption` (off `feature/production-hardening`).
- Secret scan before commit: no real key / UUID / sub-token / pbk / sid / private
  key / token in changed files (test uses synthetic keys + zero-UUID; WORKLOG
  sub-token redacted).
- Commit `730d985` (conventional). PR **#3** →
  https://github.com/dmtrbtc/SlaveAppsVPN/pull/3 (NOT merged).
- Android APK CI build on the branch (run 26725516561) = **success** — the
  enc-aware renderer compiles into the APK (non-enc nodes work; enc nodes surface
  the precise unsupported-error). Live enc connect still blocked by the core.

### Verification commands
- `pnpm --filter @slave-vpn/config build` ✓
- `pnpm --filter @slave-vpn/windows typecheck` ✓  / `build` ✓
- `node --test packages/config/test/vlessEncryption.test.ts` → 16/16 ✓
- Windows runtime 204 via `mihomo.exe` + real enc node ✓ (see Phase 6)

---

## CONTINUATION — STRATEGY = SPLIT (ship Windows now, Android enc deferred)

### Part A — tails closed
- A1 Android APK CI = **success** (run 26725516561, 4m58s).
- A2 tests 16/16 (`node --test`); only test file in repo is the enc suite.
- A3 whole-branch secret scan (`git diff feature/production-hardening...HEAD`,
  patterns: real key/uuid/sub-token/pbk/sid/private-key/gh-token/aws/slack) =
  **CLEAN** in both added lines and current file content.
- A4 **regression** (non-enc must still work):
  - Windows Reality node via current `generateMihomoConfig` →
    `gstatic /generate_204` = **204**, log `using SLAVE-SELECT[Slave-FR]`.
  - Android: `generateSingboxConfig` on the 3-node sub → vless outbounds =
    `["Slave-FR","Slave-NL 45"]` (enc node Slave-EE **skipped**), and the JSON
    contains **no** `encryption` field. Non-enc path intact, enc honestly excluded.
  - NOTE: desktop `sing-box.exe` 1.13.12 rejects our config with "legacy inbound
    fields ... removed in 1.13.0" (`sniff`/`sniff_override_destination` on mixed,
    `inet4_address`/`sniff` on tun). This is PRE-EXISTING in `buildInbounds`
    (untouched by enc) and only affects the desktop 1.13.x binary; Android libbox
    1.11.15 accepts these fields (the n24–n27 APKs ran this exact inbound shape).

### Part B — Windows production-ready
- **Fresh 204 (current code path)**: `generateMihomoConfig` on the enc node →
  mihomo (mixed-port, no admin) → `gstatic /generate_204` = **204**, log
  `match Match using SLAVE-SELECT[Slave-EE]` ⇒ traffic egressed through the
  enc tunnel via the production config builder, not a hand-made one.
- **Subscription-driven + HWID**: fresh `x-hwid` + `Mihomo/` UA → HTTP 200 with
  the enc node present (enc string 1622 chars in the returned Clash YAML). The
  panel accepted/counted the device (HWID-gated panels 404/placeholder an
  unknown/over-limit device). Visual confirmation of the device row in the
  Remnawave panel needs the operator's panel access (no admin creds here).
- **Any key set**: covered by unit tests (single / multiple / X25519-only /
  ML-KEM-only / padding / both prefixes) — all green.

### Part B — Android (deferred, honest)
- Non-enc nodes work; selecting an enc node → specific RU error
  ("VLESS Encryption … не поддерживается Android-ядром … подключитесь из Windows").
- Follow-up issue filed: "Android: mihomo gomobile core for VLESS encryption".

PR #3 description updated: Windows = done & verified; Android enc = deferred (issue).


---

# ISSUE #4 — Android mihomo (Clash.Meta) core via gomobile (branch feat/android-mihomo-core)

## Phase 0 — recon
- Android engine today = sing-box **libbox 1.11.15** (no VLESS enc). Kotlin layer:
  `apps/android/sample-native/SlaveVpnPlugin/{SlaveVpnService,SingboxBridge,
  PlatformInterface,SlaveVpnPlugin}.kt`. CI (`.github/workflows/android.yml`)
  copies `apps/android/libs/libbox.aar` → `android/app/libs/` and adds
  `implementation fileTree(dir:'libs', include:['*.aar'])` — so ANY .aar dropped
  in `apps/android/libs/` is auto-included. Renderer config built by
  `compile-config.ts` → `generateSingboxConfig` (currently SKIPS enc nodes).
- Toolchain on E:\dev (from K.5.x): Go 1.26.3 (`E:\dev\go`), Android NDK
  26.1.10909125, JDK 21. The `gomobile.exe` in gopath is the **sagernet fork**
  (for libbox) — mihomo needs the **standard** `golang.org/x/mobile` gomobile.

## Phase 1 — build mihomo .aar
- mihomo source: cloned MetaCubeX/mihomo. `main` is stale (Feb 2025, no enc);
  **Alpha** branch (`fc8c5a24`, 2026-05-30) IS enc-capable: `adapter/outbound/
  vless.go` wires `transport/vless/encryption`; go.mod has `metacubex/mlkem`.
  Same v1.19.x line as the Windows binary that passed 204.
- Integration surface (no custom TUN code needed):
  - TUN fd via clash config `tun.file-descriptor` (`listener/config/tun.go`).
  - socket-protect via `dialer.DefaultSocketHook` (CMFA contract).
  - start/stop via `hub/executor` `ParseWithBytes`+`ApplyConfig`/`Shutdown`.
  - Android embedding behind build tags `cmfa` + `with_gvisor`.
- Wrote a thin gomobile wrapper `clashbox` (libbox-equivalent):
  `E:\dev\src\mihomo\clashbox\clashbox.go` — Setup/SetProtector/StartLogForward/
  Start(configYAML)/Stop/Version. Host `go build ./clashbox` = OK.
- Installed STANDARD gomobile+gobind to `E:\dev\gomobile-std\bin` (kept the
  sagernet one intact). `gomobile bind -target=android/arm64 -androidapi=21
  -javapkg=com.slavevpn.clash -tags=cmfa,with_gvisor` → in progress.
  (PS 5.1 gotcha: must use `--%` stop-parsing; a `-ldflags=-s -w` space split
  args the first attempt.)

## Phase 2 — integration plan (Path A: replace sing-box with mihomo)
- Renderer `compile-config.ts`: emit a **mihomo clash YAML** via the SHARED
  `generateMihomoConfig` (enc no longer skipped; enc string verbatim) with
  `tunEnabled:false` (the native side injects the Android TUN block).
- Native `SlaveVpnService`: establish VpnService TUN → fd; inject
  `tun: { enable, file-descriptor: <fd>, stack: gvisor, auto-route:false,
  auto-detect-interface:false, dns-hijack:[any:53] }`; `ClashBridge.setProtector
  { fd -> protect(fd) }`; `ClashBridge.start(config)`. Stop → `ClashBridge.stop()`.
- Keep SingboxBridge code present (unused) for trivial rollback / Path B.

## Phase 2 — integration (Path A: mihomo replaces sing-box on Android)
WHY Path A (not B/parallel): both libbox.aar and clashbox.aar ship
`jni/.../libgojni.so` + `go.Seq` classes — two gomobile .aar CANNOT coexist in
one APK (duplicate native lib + classes). So sing-box is replaced, not kept
alongside. (Rollback = git; libbox.aar stays in history.)

Changes:
- `apps/android/libs/`: removed libbox.aar (+ libbox-sources.jar); added
  clashbox.aar (30 MB, arm64-v8a). CI `fileTree(dir:'libs')` auto-includes it;
  the explicit copy step now copies `libs/*.aar`.
- `apps/android/clashbox-src/`: committed `clashbox.go` (wrapper) +
  `build-clashbox.ps1` for reproducibility (binary committed per repo precedent;
  CI-build alternative noted).
- new `ClashBridge.kt`; removed `SingboxBridge.kt` + `PlatformInterface.kt`.
- `SlaveVpnService.kt` rewritten: establishes VpnService TUN → DUPs the fd
  (mihomo's sing-tun wraps the fd directly with `os.NewFile`, no dup, and closes
  it on shutdown — so we give it an exclusive dup and keep the original) →
  injects `tun: {enable, file-descriptor:<fd>, stack:gvisor, mtu:9000,
  auto-route:false, auto-detect-interface:false, dns-hijack:[any:53]}` → starts
  mihomo with a socket-protect callback (VpnService.protect) and a log forwarder.
- renderer `compile-config.ts`: emits a mihomo **Clash YAML** via the SHARED
  `generateMihomoConfig` (enc no longer skipped), `tunEnabled:false`, and an
  Android DNS profile (balanced − fallback nameservers, `useSystemDns:true`) so
  the config carries no geoip `fallback-filter`, no `geox-url`, and no
  `respect-rules` (which would require `proxy-server-nameserver`). `bridge.ts`
  passes `compiled.config`.

## Phase 3 — device-free checks (all green)
- **mihomo core .aar builds** (gomobile bind, exit 0, 108s): the CGO/NDK blocker
  risk is cleared. API: `com.slavevpn.clash.clashbox.Clashbox` (setup/start/stop/
  setProtector/startLogForward/version) + `Protector`/`LogHandler`.
- Android-generated mihomo config (replicating compile-config): **`mihomo -t`
  successful**; checks: enc node **KEPT** (`mlkem768x25519plus` present), reality
  nodes present, no desktop tun, no geoip fallback-filter, no geox-url,
  `GEOIP,private` builtin present.
- **204 through the Android-generated config** (enc node Slave-EE selected,
  mixed-port) → HTTP 204, log `using SLAVE-SELECT[Slave-EE]`. Proves the config
  path + enc handshake; only the TUN-fd handover is device-specific.
- Unit tests: 16 enc + 2 new (mihomo KEEPS enc / sing-box SKIPS enc) = **18 green**.
- renderer typecheck + build OK.
- REMAINING device-only: live TUN connect on a phone (operator) — see hand-off.
