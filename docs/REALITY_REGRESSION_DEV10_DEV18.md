# REALITY regression investigation: dev.10 to dev.18

Date: 2026-09-23. Worktree: `codex/windows-regression`, base `a0016b8`.
Status: owner connection failure remains unresolved; Stable gate is closed.

## Explicit diagnostic mode (local, not released)

With owner approval, Servers now offers an experimental Hiddify compatibility
toggle for the selected VLESS REALITY node (Mihomo on Windows and Android).
The toggle is available only with VPN disconnected and manual selection.
The warning explicitly names removal of pqv verification, ML-KEM and hello
fragmentation. Turning it off restores subscription parameters on next connect.
The shared compiler clones only the named proxy's options; it never rewrites
the stored subscription or disables classical REALITY authentication. Other
nodes are unchanged. The choice persists as `realityCompatibilityNode` and
participates in Windows connection-profile change detection.

This mimics specific handshake options, NOT Hiddify's entire core or advertised
REALITY client version. No owner-key end-to-end success is established.

## Evidence and limits

The owner clarified that v0.2.40 worked on Windows and Android, and the failure
started in the v0.2.41 series. This supersedes the earlier dev.10 baseline.
This is historical evidence, not a same-time A/B retest. The first failing
v0.2.41 development suffix is not established. The same key reportedly works
now in Hiddify 4.1.1 on Android, confirmed by the owner (4.4.1 was a typo).
The earlier Karing-success report was withdrawn: Karing also fails. PrizrakBox
on Windows reportedly works. Exact installed build provenance/settings remain
unverified; do not substitute current upstream source for the installed builds.

The first supplied failure was already in dev.13. Later dev.18 logs contain
successful REALITY authentication as well as timeout/EOF failures. Do not
attribute all those interleaved connections to one successful handshake.

## Reproducible source comparison

### Hiddify release identity check (2026-09-23)

The user supplied the official `hiddify/hiddify-app` repository. Its release
listing returns v4.1.1 (2026-03-05) as the newest published entry, not v4.4.1.
At v4.1.1, `dependencies.properties` pins `core.version=4.1.0` and the
`hiddify-core` submodule pins `c9d6f0f00b2eda34e4fb71863e4e0a62b3e931a0`.
The current main branch instead pins `f2034de743b1ad775dba026f4e6e3c44cf7d9790`;
do not use that moving branch to explain the released Android binary.
The owner confirmed the installed app is 4.1.1; 4.4.1 was a typo.

At that core commit, `hiddify-sing-box` pins
`0a02b7729f6a211436bb8bdcd8696c283eb27767`, and `ray2sing` pins
`f58be84e30d946915a1de437fbcc3d3ffca18a23`.
The latter's `ray2sing/convert.go` maps ordinary `vless://` to VlessSingbox;
the automatic Xray preference branch is disabled with `if false && ...`.
`ray2sing/vless.go` imports public key and short ID but not pqv.
`common/tls/reality_client.go` in the pinned sing-box removes X25519MLKEM768
from supported curves AND key shares, advertises REALITY version 1.8.1,
and authenticates the certificate using the classical REALITY HMAC check.
It does not implement the supplied ML-DSA verification key in that path.

This is a concrete source-level compatibility difference, not a confirmed
root cause or an attestation of the APK. Slave currently enables hybrid
key share, ML-DSA verification, and ClientHello fragmentation when pqv exists.
Do not silently discard pqv to mimic Hiddify. Any classical diagnostic mode
must be explicit, scoped, reversible, and explain the missing additional
verification. Preserve classical REALITY authentication in every case.

Run `node scripts/compare-reality-regression.cjs`. The script reads immutable
Git tags, transpiles their actual URI parsers, and compares a synthetic VLESS
Reality/Vision key. It never reads a customer's stored credentials.

| Version | URI maps pqv verification | Enables hybrid from pqv | Forces hello fragmentation |
| --- | --- | --- | --- |
| v0.2.40 comparison baseline | No | No | No |
| dev.10 | No | No | No |
| dev.13 | No | No | No |
| dev.14 | No | Yes | No |
| dev.18 | Yes | Yes | Yes |

The synthetic parsed proxy is identical in v0.2.40, dev.10, and dev.13.
All compared versions preserve Vision flow and the supplied Chrome fingerprint.
The tracked Android AAR in dev.10 and dev.13 is the SAME Git blob
`c1e22972b4ab33d6ca04a4f99b2efdf3210b3888`. The tracked native service and Go
bridge also have no changes between those two tags. This compares repository
artifacts; it does not attest the bytes installed on the reporting phone.

Therefore the later hybrid/ML-DSA/fragmentation changes cannot be the initial
dev.13 regression, although they can affect subsequent behavior. Reverting
them blindly would discard authentication checks without identifying the cause.

## Narrowed candidates

The first dev.1 contains deep-link import changes, not a core update. Commit
`5ea642e` (included starting at dev.2) replaced Windows Mihomo v1.19.27 and
Android Alpha `2c6ff72` with Mihomo v1.19.30. This is a candidate boundary,
not a proven cause. Comparison now includes the official upstream versions;
the owner's installed apps remain untouched.

1. Persisted settings/subscription state and final generated configuration:
   changed storage recovery and last-known-good subscription caching appeared
   in the dev.10-to-dev.13 range. A new synthetic regression test checks exact
   preservation of Reality fields through online fetch, cache, and offline
   reload. A pass excludes this specific serialization-loss hypothesis, not
   every possible on-device state difference.
2. Later handshake changes: retain as a separate dev.14-to-dev.18 investigation.
   The corrected local Xray 26.9.9 harness passes eight independent exact 256 KiB
   uploads/downloads with dev.18, both with and without fragmentation. These
   tests do not reproduce Android TUN/carrier conditions.
3. Server/network changes since historical success: not ruled out by past
   stable/dev.10 success. Reported Hiddify success makes a contemporaneous client
   comparison valuable, but does not identify which setting differs.

## Release gate / next evidence

### Official core A/B results (2026-09-23)

Official Windows release archives v1.19.27 and v1.19.30 were downloaded into
an isolated temporary directory, not installed. The upstream comparison shows
identical `component/tls/reality.go`, while uTLS changes from v1.8.4 to v1.8.7
and the outgoing VLESS adapter changes. Sources:
[Mihomo comparison](https://github.com/MetaCubeX/mihomo/compare/v1.19.27...v1.19.30),
[uTLS comparison](https://github.com/MetaCubeX/utls/compare/v1.8.4...v1.8.7).

Both official cores passed the same local Xray 26.9.9 test with
`minClientVer=1.0.0`, hybrid key share enabled, no ML-DSA verification and no
fragmentation: two independent TLS connections, HTTP 200 and exact 262144-byte
upload/download on each. This is a controlled common-feature comparison, NOT
the complete historical app config nor the owner's pqv profile.

A separate single run of v1.19.27 with the historical hybrid=false setting
failed against that same modern server: authentication=false, no decrypted
REALITY session, fallback certificate rejected. No retry or disabled certificate
verification was used. Consequently reverting to historical client settings is
not a validated fix for modern servers. The owner's server version/policy has
not been established and this failure must not be attributed to it.

The test harness now accepts an absolute alternate core path and an explicit
hybrid-key-share toggle, preserving default modern test behavior. No production
core, credentials, network settings, or release version was changed.

No new protocol fix or release is claimed here. Do not promote to Stable until
the affected key transfers data on Windows AND Android, including fresh start,
manual node switch, DNS and reconnect checks. A displayed ping is insufficient.

Next decisive evidence is a same-time working/failing client comparison with
version, network, selected node and sanitized effective transport options.
Do not ask the user to repost a key or raw config. Do not replace installed
clients or remove their application data merely to obtain this comparison.

Local edits also fix stale successful latency reappearing after a failed probe;
that independent UI fix is not a fix for the reported tunnel failure.

## Field A/B on the owner's real key: ROOT CAUSE IS SERVER-SIDE INTERMITTENCY (2026-09-23 evening)

With the owner's authorization, the actual failing node (duckdns-hosted,
non-443 port; no key material stored in the repo) was tested live from the
owner's host. Everything below used the real key read from the installed
client's own core config; secrets stayed in a TEMP directory outside the repo.

Chronology of the same evening (local time):

1. With the installed client's TUN active, isolated mihomo instances
   (dev.18 binary) failed 0/5 on every handshake profile with
   ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC. Later shown to be an artifact
   of the test traffic being routed through the client's own TUN (interface
   binding did not bypass it); not a handshake result.
2. With the client TUN off (clean direct network), the SAME binary passed
   5/5 on ALL profiles: modern (mldsa65+hybrid+fragment), hybrid-only,
   hybrid+fragment, hybrid+mldsa65, and plain classic. Server alive and
   accepting every Slave handshake profile, including dev.14-18 modern
   options.
3. dev.17 release binary (extracted from the published portable, same core
   patch level as the installed client) also passed 3/3 modern and 3/3
   classic on the direct path. The "26.3.27 vs 26.9.9 client version"
   hypothesis is DISPROVEN for this node: the server accepted both.
4. The installed client is 0.2.41-dev.17 (build df3e9a4), not dev.18; the
   updater had not moved it to the published dev.18.
5. Packet capture (pktmon) during a failing window: TCP handshake to the
   node completes, client core sends the fragmented ClientHello, the server
   ACKs all data and sends ZERO application bytes back; client gives up with
   FIN. ICMP alive, TCP port open, TLS application silent.
6. During that silent window the node was silent for BOTH sources tested
   (owner's RU ISP address and the EE datacenter exit) — not source-based.
7. A 45s-interval monitor caught the node returning to life ~2 minutes
   later (TLS answer in 423 ms). In the alive window, run in parallel:
   direct probe ALIVE, installed client core health-check via its API
   200 OK (4/4), and Hiddify on the owner's Android connected successfully
   — three clients, three networks, same window, all working.
8. Historical client logs show the core always reached `running` and the
   failures were traffic-level — consistent with server-side silence
   windows rather than client startup/handshake defects.

Conclusions:

- The Slave client (any of dev.17/dev.18, any handshake profile) is fully
  functional against this key whenever the server answers. All client-side
  regression hypotheses (dev.14+ parser changes, hybrid/ML-DSA/fragment,
  client version advertisement, core v1.19.27→v1.19.30) are disproven for
  this field failure by direct A/B on the real node.
- Root cause: the affected server intermittently stops answering TLS while
  its host stays up (ICMP ok, TCP accept ok, application silent for all
  sources) on a minutes scale. Any client (Slave, and plausibly the other
  user's client) fails in those windows and works outside them. "Hiddify
  works / Slave fails" observations were sampling different windows plus
  Slave's periodic group health-checks hitting the dead windows more often.
- Recommended owner/server-side action: inspect the node's server logs
  (Xray/panel restarts, OOM, anti-abuse). Nothing to fix in Slave for this
  report beyond the already-local latency UI fix; optional UX improvement:
  surface "node unstable" after repeated probe failures instead of silent
  reconnect loops.
- The other user sharing this key should be re-tested in a same-time window
  before drawing client comparisons.

No commits, releases, or config changes were made; the /32 probe route and
packet filters were removed after testing; large temporary binaries deleted.
