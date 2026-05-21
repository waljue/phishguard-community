# PhishGuard Pro — Internal Documentation

Enterprise browser extension for detecting Adversary-in-the-Middle (AitM) phishing attacks targeting Microsoft 365 / Entra ID. Deployed and managed by Base IT GmbH.

---

## Distribution

| Channel | Target |
|---|---|
| Intune (Chrome/Edge policy) | Managed corporate devices |
| Manual unpacked load | Testing / piloting |
| Firefox enterprise policy | Firefox managed deployments |

Pro edition is **not** distributed publicly. Source lives in the private Base IT repository.

---

## Features vs. Community Edition

| Feature | Community | Pro |
|---|---|---|
| AitM detection (12 signals) | ✓ | ✓ |
| EN language | ✓ | ✓ |
| DE language | — | ✓ |
| Webhook on detection | — | ✓ |
| User report + screenshot | — | ✓ (popup) |
| Manual report from any page | — | ✓ (popup) |
| Trusted badge on legit MS domains | — | ✓ |
| Custom branding (logo, colors, text) | — | ✓ |
| Signal details panel on/off | — | ✓ |
| Intune / managed storage | — | ✓ |
| Whitelist domains | — | ✓ |

---

## Build

```bash
node build.js pro chrome    # → dist/pro-chrome
node build.js pro firefox   # → dist/pro-firefox
node build.js pro           # → both
node build.js               # → all 4 variants
```

Load `dist/pro-chrome` in Chrome/Edge via `chrome://extensions` → Developer mode → Load unpacked.

---

## Configuration

Settings are applied in order (later wins):

```
PRO_DEFAULTS  ←  chrome.storage.local (Options Page)  ←  chrome.storage.managed (Intune/Registry)
```

### All configurable keys

| Key | Type | Default | Description |
|---|---|---|---|
| `language` | `"en"` \| `"de"` | `"en"` | Overlay language |
| `trustedBadgeEnabled` | bool | `false` | Green badge on legit MS domains |
| `showSignalDetails` | bool | `true` | Show collapsible signal panel in overlay |
| `whitelistDomains` | string[] | `[]` | Domains that never trigger the warning |
| `webhookEnabled` | bool | `false` | Enable webhook POSTs |
| `webhookUrl` | string | `""` | Webhook endpoint URL |
| `webhookApiKey` | string | `""` | Sent as `x-api-key` header |
| `accentColor` | hex string | `#00a19a` | Overlay accent / button color |
| `backgroundColor` | hex string | `#ffffff` | Overlay background color |
| `textColor` | hex string | `#0b1f33` | Overlay body text color |
| `customLogoUrl` | string | `""` | Logo URL or Base64 in overlay header |
| `customWarningText` | string | `""` | Override warning body text (HTML allowed) |

### Via Options Page

Open `chrome://extensions` → PhishGuard Pro → Details → Extension options.

### Via DevTools Console (testing)

Open background page inspector from `chrome://extensions`:

```js
// Read current settings
chrome.storage.local.get(null, console.log)

// Set values
chrome.storage.local.set({
  webhookEnabled: true,
  webhookUrl: "https://prod.logic.azure.com/...",
  accentColor: "#c00000",
  showSignalDetails: false,
  language: "de",
})
```

### Via Registry (Chrome / Edge — Windows)

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\3rdparty\Extensions\EXTENSION_ID\policy]
"language"="de"
"webhookEnabled"=dword:00000001
"webhookUrl"="https://prod.logic.azure.com/..."
"webhookApiKey"="your-api-key"
"trustedBadgeEnabled"=dword:00000001
"showSignalDetails"=dword:00000000
"accentColor"="#c00000"
"backgroundColor"="#ffffff"
"textColor"="#1a1a1a"
"customLogoUrl"="https://cdn.example.com/logo.png"
"customWarningText"="Achtung: Diese Seite ist eine Phishing-Seite!"
"whitelistDomains"=hex(7):65,00,78,00,61,00,6d,00,70,00,6c,00,65,00,2e,00,63,00,6f,00,6d,00,00,00,00,00
```

Replace `EXTENSION_ID` with the ID shown in `edge://extensions`.

> For Chrome: replace `Microsoft\Edge` with `Google\Chrome` in the registry path.

### Via Intune (recommended for production)

1. Intune Admin Center → Devices → Configuration → Settings Catalog
2. Search: **Microsoft Edge** → **Extensions** → **Configure extension management settings**
3. Add JSON policy (see below) or use OMA-URI

**JSON policy format:**

```json
{
  "EXTENSION_ID": {
    "installation_mode": "force_installed",
    "update_url": "...",
    "runtime_blocked_hosts": [],
    "managed_configuration": {
      "language": "de",
      "webhookEnabled": true,
      "webhookUrl": "https://prod.logic.azure.com/...",
      "webhookApiKey": "your-api-key",
      "trustedBadgeEnabled": true,
      "showSignalDetails": false,
      "accentColor": "#c00000",
      "backgroundColor": "#ffffff",
      "textColor": "#1a1a1a"
    }
  }
}
```

---

## Webhook

All three event types POST to the same `webhookUrl`:

### Detection (automatic)

Fires when a page exceeds the detection threshold. No screenshot.

```json
{
  "source": "aitm-block-pro",
  "version": "1.0.0",
  "type": "detection",
  "timestamp": "2026-05-21T10:00:00.000Z",
  "url": "https://evil-proxy.example/login",
  "host": "evil-proxy.example",
  "score": 14,
  "threshold": 7,
  "breakdown": { "jsGlobals": 4, "tenantBranding": 3, "domIds": 3, "msCdn": 3, "bodyClass": 1 }
}
```

### User report (from overlay)

Fires when user clicks "Report Phishing" in the warning overlay. Includes screenshot.

```json
{
  "source": "aitm-block-pro",
  "type": "user_report",
  "screenshot": "data:image/jpeg;base64,...",
  ...same fields as detection minus threshold...
}
```

### Manual report (from popup)

Fires when user clicks "Report this page as phishing" in the extension popup. Works on any page, not just detected ones. Includes screenshot.

```json
{
  "source": "aitm-block-pro",
  "type": "manual_report",
  "timestamp": "2026-05-21T10:00:00.000Z",
  "url": "https://suspicious-page.example/",
  "host": "suspicious-page.example",
  "screenshot": "data:image/jpeg;base64,..."
}
```

---

## Detection engine

Shared with community edition. Lives in `shared/detection.js`. Any change there applies to both editions on next build.

**Threshold:** 7 points. Legitimate MS pages score 18–24. AitM proxies score 10–17.

To update detection logic: edit `shared/detection.js` → commit to private repo → sync action pushes to public repo automatically.

---

## Repository structure

```
shared/detection.js        — shared detection engine (both editions)
community/                 — PhishGuard Community (public repo mirror)
pro/                       — PhishGuard Pro (private repo only)
assets/                    — shared icons and images
build.js                   — builds dist/ variants
.github/workflows/
  release.yml              — tags community release to public GitHub
  sync-community.yml       — syncs community + shared to public repo on push
```

---

## Releasing

### Community edition (public GitHub release)

```bash
git tag v1.x.x
git push origin v1.x.x
```

GitHub Action builds, packages, and publishes the release automatically. ZIPs are attached to the release.

### Pro edition

No automated release. Build manually:

```bash
node build.js pro chrome
node build.js pro firefox
```

Distribute `dist/pro-chrome` / `dist/pro-firefox` via Intune or manual deployment.
