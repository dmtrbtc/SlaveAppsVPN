# Windows regression investigation — 2026-09-12

Status: local fixes with automated evidence; NOT release approved. The root cause
of the original reconnect loop is not confirmed by the supplied flattened logs.
The later duplicated-node report now has a live, privacy-safe confirmation on the
affected application. Do not describe this candidate as a fully verified dev.13
release.

## Checkout and comparison

- Isolated branch `codex/windows-regression`, based on `ada0aba` (dev.12).
- Existing dirty `E:\SlaveApps` and other worktrees were not edited.
- Compared `v0.2.41-dev.10` (`6d0128b`), `2ce419d` (dev.11), `ada0aba`.
- No version bump, commit, tag, push or publication. Android native code unchanged;
  the shared renderer now reuses one Capacitor plugin proxy.
- `scripts/windows-regression-compare.cjs` loads each historical engine's actual
  source, using synthetic process/API seams. It does not read customer settings.
- Evidence: `WINDOWS_REGRESSION_COMPARISON.json`.

## Proven regression: removed persisted manual target

The same synthetic input has `selectedProxy` pointing at a node absent from the
current selector group. This is a real possible state after subscription changes.

1. `RuntimeServiceImpl.connect()` builds a profile using persisted selectedProxy.
2. `RuntimeManager.connect()` sets connectionDesired and queues `engine.start()`.
3. Mihomo starts and its API becomes ready.
4. `MihomoEngine.start()` calls `selectProxy(SLAVE-SELECT, savedTarget)`.
5. The API rejects the missing target. Starting with dev.11 this exception is
   fatal: start's catch kills the process, transitions starting → error and throws.
6. RecoveryCoordinator schedules another connect, using the same saved target.
   Each attempt launches and terminates another process for the same reason.

dev.10 caught selection failures and proceeded to running. The comparison records
one spawn and running for dev.10; three failed starts for dev.11 and dev.12; one
spawn and running for the candidate. This demonstrates a regression condition,
not evidence that the customer's stored target is missing.

Fix: after a failed startup selection, query the live selector membership. Only
when the requested target is absent AND SLAVE-AUTO exists, explicitly select AUTO
and emit `runtime.saved_proxy_unavailable`. No target name or subscription data is
logged. The in-memory last-good profile is updated to the accepted AUTO selection,
so later refresh and rollback operations remain consistent. The persisted setting
is retained for a future subscription that restores the node. A present target
failing selection, failed membership lookup, or failed
AUTO selection still fails. Explicit profile application/restart remains strict
and restores the previous profile on failure. Persisted settings are not changed.

## Other reproduced lifecycle defects

- Unconfirmed termination left stop() in `stopping`. The new regression expected
  `error` and failed on the original code. stop() now emits error and rethrows;
  the existing ProcessManager reference and start() guard still prevent replacing
  a process whose exit was not confirmed.
- After recovery exhaustion, duplicate error events started another five-attempt
  cycle. The regression observed attempt 6 where 5 was expected. Exhaustion is
  now latched until a successful connection or disconnected intent is observed.
- The production resume handler called disconnect then connect unconditionally.
  A user Disconnect during shutdown was overwritten by resume's later connect.
  The test executes the actual exported handler source with controlled services;
  it failed with connectionDesired=true after Disconnect. The service now checks
  the command epoch after shutdown and coalesces simultaneous resume requests.

## Follow-up: false DNS status and transient TUN startup

The installed diagnostic build connected and real sites opened, while the UI
reported DNS failure. HealthMonitor ran an independent Node c-ares resolve in
parallel with its hostname-based HTTP request through Mihomo. The latter is
stronger end-to-end evidence: if it returns successfully, the active Mihomo DNS
path resolved the hostname. The independent probe could fail while Windows/TUN
routes settled and incorrectly override the successful result. It also generated
unnecessary encrypted-resolver traffic whose losing parallel request can appear
as `operation was canceled` in Mihomo logs.

HealthMonitor now treats successful hostname connectivity as proof of runtime DNS
and skips the redundant c-ares request in that case. A real failure remains a DNS
failure when both the end-to-end request and fallback resolver probe fail.

The normal health interval is 30 seconds. A first connectivity request that lands
while TUN is settling could therefore leave a stale 40/100 `offline` result for
most of that interval even though browsing had already recovered. During the
first 60 seconds HealthMonitor now retries a failed connectivity check after one
second, tries two independent public HTTP endpoints with a three-second timeout
per endpoint, stops early on success, and discards a late result after
stop/restart. Observed real traffic also schedules a prompt recheck instead of
waiting for the normal 30-second interval. The dashboard labels this bounded
window as `Проверяем соединение`, animates the indicator and displays elapsed
seconds; a persistent failure becomes visible normally after the bounded window.

The TUN log showed an adapter create/open retry. A live read later showed exactly
one current Mihomo process and the `Mihomo` interface Connected, so that observed
attempt recovered. The health hook previously returned true merely when
`wintun.dll` existed, which could mask a missing interface. It now requires the
named adapter to be active with a non-internal address. This reports a continuing
TUN failure accurately while allowing the recovered adapter to become healthy.

The later per-domain `dns resolve failed` lines are real lookup failures for those
specific hosts, not evidence that all DNS is down. Canceled connections to public
encrypted resolvers are losing/canceled attempts and are not sufficient on their
own to mark DNS unhealthy.

## Follow-up: duplicated dashboard nodes

The startup sequence retained the legacy `config-source` for compatibility and
also migrated its identical input into `SubscriptionStore`. The aggregator then
fetched both records, so the same logical source entered the dashboard/runtime
projection twice. This matches the user's earlier log sequence (`Using stored
config source` followed by `Migrated legacy config source to subscription store`).

ConfigSourceService now exposes only a non-logged canonical comparison identity.
Before fetching the compatibility source, SubscriptionAggregatorService compares
that identity with enabled store entries and suppresses the duplicate. A test
proves one fetch, one node and one source attribution for the migration case. A
second test proves that disabling the migrated store copy reactivates the retained
legacy source, so compatibility fallback is preserved.

The first source-level fix corrected the configuration applied to Mihomo, but the
dashboard's `getProxyList()` still bypassed the aggregator and read the retained
legacy ConfigSource directly. That explains why duplicates remained on screen and
why the dashboard could sometimes be empty while the runtime had nodes. The UI
list now parses the same cached aggregated snapshot used for the active Mihomo
profile, with legacy fallback only when no enabled SubscriptionStore entry exists.
A regression test supplies a duplicated legacy list and proves it is never read.

The renderer also registered the Capacitor `SlaveVpn` proxy independently in the
main Android bridge and updater module. Both now share one module-level proxy,
removing the repeated-registration warning and duplicate listener risk.

The latest installed build still showed five `#2` pairs. A live privacy-safe
inspection found one application owner and exactly one Mihomo process, excluding
a second runtime instance as the source. The active generated configuration held
13 nodes but only 8 base names. Each repeated pair had the same name, protocol,
server, port, transport and security shape, while its credential fingerprint and
source fingerprint differed. One source was the current ConfigSource; the other
was the earlier migrated SubscriptionStore source. This proves that the cabinet
URL/key and credentials had rotated, so exact source-input comparison could not
recognise the stale migrated copy.

The aggregator now treats a stored source as superseded only when every one of
its logical node topology keys exists in the current ConfigSource. It keeps the
current source and ignores the fully shadowed stale result without deleting
stored data. A regression covers the rotated-credential case. A second regression
proves that a subscription containing any independent node remains present, so
ordinary partially overlapping subscriptions are preserved.

A later live screenshot showed the remaining endpoint-rotation variant: the
Subscriptions page correctly counted two stored sources with five nodes, while
Servers showed nine because the four-node cabinet compatibility source had also
been aggregated. Its names and protocols matched the four-node stored source,
but its addresses/ports had changed, so the topology-only comparison retained it
and name uniquification produced `#2`. A complete multi-node name/protocol set now
also supersedes that stale compatibility copy. Loose matching is disabled for
single-node sources and for partial overlaps, preserving the independent fifth
node. Regressions cover both outcomes.

Read-only inspection of the still-connected installed candidate then identified
the final case precisely. The active Mihomo configuration contained nine nodes:
four from `__config-source__`, four from the visible URL subscription, and one
independent node. Three pairs had identical name, protocol and full topology but
different credential/source fingerprints; the fourth node differed between the
two four-node sets. Thus the conservative partial-overlap rule correctly kept
both sets, but the hidden compatibility source and visible URL source belonged
to the same subscription host. The aggregator now suppresses the hidden
ConfigSource whenever an enabled explicit subscription URL has the same exact
host. Sources from another host still combine with cabinet nodes. This live read
did not restart Mihomo, apply a profile, or alter the VPN connection.

At the same live checkpoint, four HTTP/HTTPS connectivity requests through the
active local proxy returned 204. The application therefore had working tunnel
egress while the dashboard still carried the earlier negative verdict. The logs
also show the Windows TUN retry starting more than 15 seconds after connect and
canceled encrypted-DNS attempts continuing past 20 seconds, supporting the longer
startup window and traffic-triggered refresh.

## Process ownership, settings and profile audit

- Windows still constructs RuntimeManager with autoReconnect:false. Automatic
  failed-state retries belong to RecoveryCoordinator. Resume uses the service's
  guarded operation, not a second failed-state retry timer.
- connectLock/disconnectLock are released in finally. Explicit Disconnect clears
  desired state immediately through RuntimeManager, invalidates queued operations,
  and supersedes the pending resume command.
- RuntimeManager queues engine mutations and clones profile inputs. The service
  serializes profile resolution and gates applying subscriptions on running state
  and connection epoch. Existing tests cover unchanged profiles, concurrent
  mutations, rollback and asynchronous settings persistence/snapshot consistency.
- ProcessWatcher listens for actual exit before clearing ownership. No reproduced
  evidence showed its exit callback racing a synchronous kill() listener setup.
  SIGTERM/SIGKILL confirmation logic was retained; process diagnostics were added.
- No new forceReset calls or recovery disabling were introduced.
- The interface-monitor warning is not used as a state transition or retry trigger.
  Actual network-interface changes remain untested in the packaged application.

## Diagnostics and IPC warning

Recovery failures now include safe errorMessage/errorType, attempt, generation,
state and connectionDesired in structured logs AND in displayed log text and a
runtime error event. Fixed lifecycle errors remain readable; API bodies/arbitrary
messages are omitted, as they may contain secrets. Process logs include spawn,
stop request, signals, PID and confirmed exit/timeout. Connection begin/failure
and state changes are recorded safely.

The existing DiagnosticsPage rendered/copied only `msg`, losing structured `err`
and IPC metadata. IpcValidator now includes channel, payloadType, issue codes and
requestId in its message as well as its structured fields. Handler exceptions now
also include channel, requestId, error type and a privacy-safe cause category; the
arbitrary exception text is omitted from logs. Invalid requests remain blocked
before handler execution.

The exact channel in the user's historical warning is UNKNOWN: neither the pasted
flattened logs nor the Gist supplied those fields. The Gist contains 500 debug
lines from a different timestamp, without the target reconnect/IPC warnings.
No specific UI payload fix or causal linkage is claimed for that historical IPC
warning. The duplicated and intermittently empty dashboard paths now share the
runtime's aggregated source of truth. Source supplied by the user:
https://gist.github.com/Orel666/317a7afbc112df967b1d0d07821283ff

## Verification and limitations

- Runtime: 42/42, including DNS evidence precedence, dual-endpoint connectivity,
  prompt startup retry,
  stale-check cancellation, genuine DNS failure, startup fallback, applied-profile consistency, strict profile restart and safe errors.
  stop timeout, process confirmation and prior rollback/serialization regressions.
- Windows lifecycle: 58/58; includes TUN adapter health, source migration dedup,
  credential/endpoint-rotated source supersession, same-host cabinet suppression,
  partial-overlap and single-node preservation, and
  dashboard/runtime projection consistency,
  compatibility fallback and privacy-safe IPC exception diagnostics, plus
  initial failure recovery, late crash after Disconnect, duplicate failed events,
  exhaustion, resume cancellation and duplicate resume events.
- Windows renderer/storage: 31/31.
- Workspace typecheck: 24/24 after final production changes.
- `pnpm lint`: exits 0, but packages define no lint tasks; Turbo only runs dependent
  builds. This is NOT substantive lint coverage and is a release-gate limitation.
- `pnpm audit --audit-level high`: 3 findings remain (1 low, 2 high). The high
  findings are both `extract-zip@2.0.1` under Electron 39.8.10's development-time
  archive downloader; that package is absent from the shipped app dependencies.
  A direct override to Electron's newer internal extractor was tested and broke
  the installer API, then was reverted. Remediation requires a separately tested
  Electron major-version upgrade; the residual build-time exposure is explicit.
- Windows production build: passed.
- Isolated Electron settings lifecycle and rendered settings UI: passed with
  Electron 39.8.10 in two process/restart phases. Real settings IPC, sandbox and
  persistence passed; temporary profiles were used and both processes exited.
- Real isolated Mihomo process/API smoke: passed, including crash/restart, Manual/
  AUTO, mode reload, last-good rollback, removed target → AUTO, confirmed stops,
  and five sequential start/stop cycles. It disables TUN, DNS listening and external
  probes and uses only synthetic loopback proxies. It is NOT real VPN egress,
  system proxy, packaged UI, sleep/resume or Ethernet/Wi-Fi validation.
- Package verification checks final compiled files, dependency resolution, actual
  native SQLite under Electron 39.8.10 and required binaries. It does not launch
  the installed GUI or prove full packaged Windows smoke.
- Local diagnostic installer rebuilt after the final source change at
  `apps/windows/release/regression-local/SlaveAppsVPN-Setup-v0.2.41-dev.12.exe`.
  Embedded build time: `2026-09-13T08:12:15.225Z`. Size: `132956286` bytes.
  SHA-256: `26DFCC1FE24F4397FBC2CDB5C9911FECF9E7214B820C4BC2499448D7E7D0214A`.
  It retains the dev.12 version by instruction and is unsigned; do not distribute
  or install it as a release candidate.
- A current live process check found exactly one application-owned Mihomo process.
  It was inspected only through safe process, port and hashed configuration
  metadata and was not stopped or modified.
- `git diff --check`: passed. Review limited to Windows/runtime fixes and tests,
  diagnostics, smoke scripts and evidence; unrelated work was preserved.

No customer subscriptions, secure storage, profiles or settings were read or
modified for tests. No changes were made to their paths or migration code. This
does NOT prove the actual installer upgrade from dev.10 or dev.12 preserves data.

## Release blockers / next evidence

1. Obtain the safe error fields from the affected installation to identify its
   exact failure, plus the IPC channel/reasons. Correlation is still missing.
2. Run an isolated VM/test-machine packaged matrix: fresh install; dev.10 and
   dev.12 upgrades; verify secure subscriptions/settings/profile hashes without
   exposing content; actual VPN connect/disconnect/recovery and all settings
   mutations; app restart/exit while active; verify system proxy/TUN cleanup.
3. Run actual sleep/resume, Ethernet/Wi-Fi down/up and default-interface changes;
   check process count, no orphan, no storm and real traffic continuity.
4. Resolve the absent substantive lint task before treating that gate as green.

Only after these gates should a candidate version be proposed. No release should
be published from this investigation state.
