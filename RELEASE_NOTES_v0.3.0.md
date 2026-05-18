# SLAVE VPN v0.3.0-beta — Release Notes

**Release date:** 2026-05-18  
**Branch:** `feature/production-hardening`  
**Tag:** `v0.3.0-beta`

---

## What's new

### Universal subscription support

SLAVE VPN now correctly parses any subscription format a proxy provider can throw at it:

- **VLESS Reality** — full `pbk/sid/fingerprint/flow/alpn` params
- **VLESS WS / gRPC / H2 / HTTPUpgrade**
- **Trojan, Hysteria2, TUIC v5, Shadowsocks**
- **Clash YAML passthrough** — YAML from premium providers passes through directly
- **Base64-encoded links** — common in Telegram bots
- **Multi-UA rotation** — tries `clash.meta`, `Mihomo/1.18.7`, `ClashX`, `Clash/2.0.4` to bypass UA filtering

Protocol badges on the Servers screen show the security layer at a glance (REALITY / WS / gRPC / TLS).

### Real connectivity feedback

The Diagnostics screen now shows a live connectivity panel:

- **Engine state** — idle / starting / running / stopped / error
- **Health score (0-100)** — weighted composite of process, API, TUN, DNS, connectivity, traffic
- **6 status dots** — Process · API · TUN · DNS · Network · Traffic
- **Active proxy name and count** — queried from Mihomo API after connect

Error events from the Mihomo engine are classified and displayed in human-readable Russian in the Runtime Events log.

### Auto-update with user control

- Updates are checked on startup and can be triggered manually from Settings
- Download is user-initiated — no surprise background downloads
- **Stable** / **Beta** channel selection
- Progress bar during download; "Restart and install" button when ready

### Crash resilience

- **Recovery coordinator**: automatic reconnect with 1 → 2 → 4 → 8 → 16 s backoff; gives up after 5 attempts and fires a critical notification
- **Log rotation**: main.log capped at 5 MB, up to 3 backups retained
- **Session tracking**: every log line carries a session ID for cross-session correlation
- **Diagnostics export**: one-click ZIP bundle including all log backups and crash log

---

## Known limitations

- Code signing not yet configured (EV cert pending)
- Auto-update requires production build (`app.isPackaged = true`); update UI shows "current" in dev
- Split-tunnel process list editor is a stub (UI wired, no process picker yet)
- Outbound IP detection not implemented (privacy-sensitive, out of scope for beta)

---

## Upgrade notes

Settings file gains a new `updateChannel` field (defaults to `"stable"`). The existing `settings.json` will be migrated automatically via the spread-merge fallback in SettingsStore.

---

## Architecture audit

| Layer | Status |
|-------|--------|
| VPNProvider interface (provider-agnostic) | ✅ All config sources implement ConfigSource |
| Subscription parsing | ✅ Multi-format, partial-parse tolerant |
| IPC type safety | ✅ Zod validation on all invoke channels |
| Renderer state | ✅ Zustand + TanStack Query, no direct IPC in components |
| Error classification | ✅ Mihomo log → RuntimeEventKind taxonomy |
| Recovery | ✅ RecoveryCoordinator with exponential backoff |
| Update system | ✅ UpdateService with user-gated download |
| Logging | ✅ Structured pino, rotation, session correlation |
| Pre-flight | ✅ Binary + port + directory checks before connect |
| Code signing | ⏳ Pending EV certificate |
| Split tunnel process picker | ⏳ Future iteration |
| Outbound IP detection | ⚠️ Out of scope (privacy) |
