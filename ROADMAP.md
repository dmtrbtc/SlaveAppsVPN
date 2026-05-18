# SLAVE VPN — Roadmap

## v0.3.0-rc1 (current)

- [x] VLESS-FIRST subscription pipeline
- [x] Reality / WS / gRPC / H2 protocol parsing
- [x] Proper Mihomo YAML generation
- [x] Multi-UA subscription fetching with ETag cache
- [x] ConfigSource abstraction (subscription-url, single-proxy, remnawave-key)
- [x] Onboarding wizard with node preview
- [x] Pre-flight runtime validation (binary, TUN, port, workdir)
- [x] Mihomo log error classifier (VLESS/Reality error taxonomy)
- [x] Connectivity IPC with health score + active proxy
- [x] Auto-update system with channel selection (stable/beta)
- [x] RecoveryCoordinator with exponential backoff
- [x] SafeModeManager with crash loop detection
- [x] NodeHealthManager with per-node quarantine
- [x] Captive portal detection + actionable suggestions
- [x] Log rotation + ZIP export
- [x] Session ID tracking in logs
- [x] Reduced-motion accessibility
- [x] Aurora design system (7 screens)

## v0.4.0 — Beta

- [ ] Code signing (EV certificate)
- [ ] Split tunnel process picker UI
- [ ] Telegram login integration
- [ ] Per-node latency measurements (through proxy)
- [ ] Node selection UI (preferred node pinning)
- [ ] Automatic node fallback on repeated quarantine

## v0.5.0 — Stable

- [ ] Auto-update in production builds (signed releases)
- [ ] NSIS installer with WinTUN driver install hook
- [ ] Windows Defender exclusion guidance
- [ ] Multiple provider profiles
- [ ] Import/export configuration
- [ ] Advanced routing rule editor

## Future

- Outbound IP display (opt-in, privacy-first)
- Kill switch enforcement via Windows Firewall API
- IPv6 support
- macOS/Linux ports (engine-neutral architecture ready)
