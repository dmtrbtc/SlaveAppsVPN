# Code Signing — SLAVE VPN

Windows SmartScreen marks unsigned `.exe` files as untrusted. Signing the
installer + binaries eliminates the warning and unlocks faster reputation
scoring on Microsoft's filter.

This document covers:
- What certificate to buy
- How to sign locally (one-off)
- How to wire signing into CI (GitHub Actions)
- Troubleshooting

---

## 1. Certificate types

| Type | Cost | SmartScreen | Storage |
|---|---|---|---|
| **OV** (Organization Validation) | $200-400/yr | Reputation builds gradually | File-based `.pfx` |
| **EV** (Extended Validation) | $400-700/yr | Instant SmartScreen pass | **Hardware token only** (YubiKey, SafeNet, …) |

**Recommendation:** EV for production releases. OV for internal/beta builds.

**Where to buy:**
- Sectigo / Comodo — cheapest, fast issuance
- DigiCert — premium, slow issuance, best for enterprise
- SSL.com — middle ground

OV ships you a `.pfx` file + password. EV ships you a USB token + driver +
PIN.

---

## 2. Local signing (one-off, OV cert)

```powershell
# 1. Place the .pfx outside the repo (NEVER commit it)
#    Suggested: C:\codesign\slavevpn.pfx

# 2. Set env vars in the shell that will run `pnpm dist`
$env:CSC_LINK = "C:\codesign\slavevpn.pfx"
$env:CSC_KEY_PASSWORD = "your-pfx-password"

# 3. Build — electron-builder picks them up automatically
pnpm --filter @slave-vpn/windows dist
```

electron-builder will:
1. Sign `mihomo.exe`, `sing-box.exe`, `wintun.dll` (extraResources)
2. Sign `slave-vpn.exe` (main app)
3. Sign the NSIS installer + portable .exe
4. Timestamp each signature via DigiCert's RFC3161 server

Verify the signed result:

```powershell
Get-AuthenticodeSignature .\release\0.2.0\SlaveAppsVPN-Setup-v0.2.0.exe
```

Should report `Status: Valid` and `SignerCertificate.Subject` matching your
organization.

---

## 3. Local signing (EV cert, USB token)

EV tokens use a CSP / KSP — `.pfx` flow does **not** apply. You must:

1. Install the token's driver (SafeNet Authentication Client, etc.)
2. Tell electron-builder to use signtool directly with the cert subject

In your shell:

```powershell
$env:CSC_LINK = ""               # explicitly empty to disable .pfx path
$env:WIN_CSC_LINK = ""
# Use a custom signing function that calls signtool with /n "Your Org"

# Then in electron-builder.yml add:
#   win:
#     sign: ./scripts/sign-ev.js
```

`scripts/sign-ev.js` example (create when EV is acquired):

```js
exports.default = async function (configuration) {
  const { execSync } = require('child_process')
  const target = configuration.path
  const cert = '"Your Organization, LLC"'  // exact CN as on the cert
  execSync(`signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /n ${cert} "${target}"`, {
    stdio: 'inherit',
  })
}
```

The token PIN is entered interactively for each signature (or once if cached
by the driver for a session).

---

## 4. CI signing (GitHub Actions)

For OV certs only — EV signing on CI is possible but requires a dedicated
HSM service (SignPath, Azure Code Signing) and is not covered here.

### Step 1 — encode the .pfx as base64

```bash
base64 -w 0 slavevpn.pfx > pfx.b64
```

### Step 2 — store secrets in repo settings

| Secret name | Value |
|---|---|
| `WIN_CSC_LINK` | contents of `pfx.b64` |
| `WIN_CSC_KEY_PASSWORD` | the .pfx password |

### Step 3 — workflow

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm download:binaries
      - run: pnpm --filter @slave-vpn/windows dist
        env:
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            apps/windows/release/*/SlaveAppsVPN-Setup-*.exe
            apps/windows/release/*/SlaveAppsVPN-Portable-*.exe
            apps/windows/release/*/latest.yml
```

electron-builder reads `WIN_CSC_LINK` (base64 string), decodes it to a temp
`.pfx`, signs everything, then deletes the temp file.

---

## 5. What gets signed

`electron-builder.yml` → `extraResources` filters control inclusion;
electron-builder signs every `.exe` and `.dll` it finds in the unpacked tree:

| File | Why signed |
|---|---|
| `resources/bin/mihomo.exe` | Spawned by app — Windows checks signature on TUN driver load |
| `resources/bin/sing-box.exe` | Same |
| `resources/bin/wintun.dll` | TUN driver — **must** be signed or load fails on modern Windows |
| `resources/elevate.exe` | Built-in helper for UAC prompts |
| `slave-vpn.exe` | Main app — SmartScreen primary target |
| `SlaveAppsVPN-Setup-*.exe` | NSIS installer — public-facing |
| `SlaveAppsVPN-Portable-*.exe` | Portable build |
| `__uninstaller-nsis-*.exe` | Uninstaller |

**Note about `wintun.dll`:** Upstream's official `wintun.dll` is already
signed by WireGuard LLC. We re-sign it during packaging because some
electron-builder workflows strip signatures. If verification fails on
`wintun.dll` after signing, replace it with the upstream signed copy
verbatim and exclude it from the signing pass.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `no signing info identified, signing is skipped` | `CSC_LINK` / `WIN_CSC_LINK` not set | Set env vars (see §2 / §4) |
| `Error: ENOENT … signtool.exe` | Windows SDK not installed | Install Windows SDK or use a build agent that has it preinstalled (`windows-latest` does) |
| Signed but SmartScreen still warns | OV cert reputation building | Wait — accumulates ~weeks of downloads. Use EV for instant pass |
| `signtool: error TF1003` | EV token locked | Restart driver, re-enter PIN |
| `wintun.dll` loads fails after signing | Cross-signing mismatch | Don't re-sign `wintun.dll`; use upstream signed copy |

---

## 7. Verification checklist before public release

```powershell
# 1. Signed binaries
Get-ChildItem .\release\0.2.0\win-unpacked\resources\bin\*.exe |
  ForEach-Object { Get-AuthenticodeSignature $_.FullName | Select Path, Status }

# 2. Signed installer
Get-AuthenticodeSignature .\release\0.2.0\SlaveAppsVPN-Setup-v0.2.0.exe

# 3. Test install on a clean Windows VM — confirm no SmartScreen warning
```

Expected: all `Status: Valid`. Anything else is a release blocker.
