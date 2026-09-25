# SLAVE VPN — Roadmap

## v0.3.0 (current, stable)

Все пункты исторических v0.3.0-rc1/v0.4.0-beta выполнены и включены:

- [x] VLESS-FIRST subscription pipeline (Reality / WS / gRPC / H2)
- [x] Modern REALITY: X25519/ML-KEM hybrid, ML-DSA-65 (pqv), ClientHello
      fragmentation, client version 26.9.9 (shared core patches)
- [x] Unified Windows/Android core: routing (P1), DNS (P2), settings (P3)
- [x] Node stability UX: quarantine/failure badges, dashboard warning
- [x] Per-node latency measurements through the proxy + node pinning +
      automatic fallback (SLAVE-AUTO, balancer)
- [x] Telegram login (Remnawave cabinet)
- [x] Split tunnel process picker
- [x] Auto-update with channel selection; dev builds auto-follow the Dev
      channel; stable feed via releases/latest
- [x] SafeModeManager crash-loop gate, RecoveryCoordinator backoff,
      NodeHealthManager quarantine
- [x] Release engineering: full-test preflight gates, mihomo -t on PRs,
      SHA256-pinned engine binaries (mihomo/sing-box/wintun), mihomo tag
      commit verification
- [x] ~110 new tests across parsers, DNS compiler, balancer/probing,
      API client, state-sync, Kotlin

Known limitation: Windows installer is unsigned (owner decision — no paid
certificate; free signing exists only for open source). SmartScreen warns
on first install until reputation builds.

## v0.3.x (patch line)

- [ ] v0.3.1-dev.N: post-stable fixes land here first (never v0.3.0-* tags:
      semver ranks a release above its own prereleases)

## v0.4.0 — Next feature line (candidates)

- [ ] IS_MOBILE cleanup in the shared renderer (43 gates → platform shells)
- [ ] Android bridge gaps: native geo updates, log export, self-test
- [ ] NSIS installer with WinTUN driver install hook
- [ ] Import/export configuration
- [ ] Advanced routing rule editor
