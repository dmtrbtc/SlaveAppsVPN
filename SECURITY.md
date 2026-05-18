# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | ✅ Current |
| < 0.3   | ❌ No longer supported |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues via GitHub's private vulnerability reporting:
https://github.com/dmtrbtc/SlaveAppsVPN/security/advisories/new

We will acknowledge within 48 hours and aim to patch within 7 days for critical issues.

## Security Design

### IPC Architecture
- All IPC channels use `contextIsolation: true` and `contextBridge`
- No direct Electron API access from renderer
- All invoke channels are Zod-validated in `handleIpc()`
- No secrets (API tokens, keys) ever cross the IPC boundary in plaintext

### Credential Storage
- API tokens stored via `safeStorage` (OS-level encryption)
- Subscription URLs / proxy keys stored via `safeStorage`
- Nothing sensitive in `localStorage` or renderer state

### Network
- Mihomo engine runs as a child process, not as a service
- API secret (`--secret`) is generated randomly per session (crypto.randomBytes)
- No hardcoded API endpoints in renderer code

### Runtime Isolation
- mihomo.exe runs with the app's user permissions (not elevated)
- WinTUN driver loaded by mihomo automatically when present
- Pre-flight checks prevent connecting with missing binaries

### Binary Integrity
- `resources/bin/` bundled by electron-builder, path verified at startup
- Pre-flight validates `existsSync(binaryPath)` before every connect

### Known Limitations
- Code signing not yet implemented (EV cert pending)
- No automatic binary hash verification (planned for v0.4.0)
- Mihomo engine output not sandboxed (same trust level as main process)
