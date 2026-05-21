# Development Guide

Internal reference for the AitM Block Extension project.

## Project structure

```
shared/
  detection.js            Shared detection engine — 12 signals, threshold 7
                          All functions are prefixed aitm_ to avoid page globals collisions

community/
  content.js              Warning overlay — whennotif• CI, EN only
  background.js           Tab scanner, retry logic
  manifest.chrome.json    Chrome / Edge MV3
  manifest.firefox.json   Firefox MV2
  _locales/en/
  README.md               Community-facing README (copied into dist, used as GitHub README)

pro/
  content.js              Warning overlay + report button + trusted badge
                          Inline DE/EN translation objects (not chrome.i18n)
  background.js           Tab scanner + webhook POST + screenshot capture
  options.html/js/css     Settings page — Base IT CI
  managed_schema.json     Intune managed storage schema
  manifest.chrome.json    Chrome / Edge MV3
  manifest.firefox.json   Firefox MV2
  _locales/en/ _locales/de/

assets/                   Shared icons and images
                          ⚠ icon16.png, icon48.png, icon128.png still missing
                            Export from assets/icon-community.svg or replace with edition icons

build.js                  Build script — no npm dependencies required
package.json              npm scripts wrapper
.github/workflows/
  release.yml             Auto-build + GitHub Release on git tag push
```

## Build

```bash
node build.js                     # all 4 variants
node build.js community           # community-chrome + community-firefox only
node build.js pro                 # pro-chrome + pro-firefox only
node build.js community chrome    # single variant
```

Output goes to `dist/`. The build script:
1. Copies `shared/detection.js` as the first content script
2. Copies edition source files (skipping `manifest.*.json` and `README.md`)
3. Copies edition `README.md` (community) or root `README.md` (pro) as `README.md`
4. Copies the correct browser manifest as `manifest.json`
5. Copies the `assets/` folder

## Releasing (community edition)

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions (`.github/workflows/release.yml`) then:
1. Patches the version from the tag into both community manifests
2. Runs `node build.js community`
3. Zips `dist/community-chrome` and `dist/community-firefox`
4. Creates a GitHub Release with both ZIPs and install instructions

Tags with a hyphen (`v1.2.0-beta`) are published as pre-release.

## Detection engine

`shared/detection.js` — all check functions are stateless, no side effects.

| Key | Weight | Notes |
|---|---|---|
| `jsGlobals` | 4 | `$Config`/`ServerData` or ≥3 inline script markers |
| `tenantBranding` | 3 | `$Config.aTenantBranding[0].TenantId` / BannerLogo present |
| `pageId` | 3 | `<meta name="PageID" content="ConvergedSignIn">` |
| `msCdn` | 3 | CDN resources from aadcdn.msftauth.net etc. |
| `domIds` | 3 | ≥2 MS-specific selectors |
| `bodyClass` | 2 | body.win10 / win7 / mac or data-bind on body |
| `msButtonColor` | 2 | Button near #0067b8 ±10 |
| `logoHint` | 2 | img referencing MS branding |
| `oauthHiddenInputs` | 2 | ≥2 hidden inputs with OAuth names |
| `formStructure` | 1 | password or email field |
| `titleMatch` | 1 | "Sign in"/"Microsoft" in title |
| `buttonText` | 1 | sign-in button labels |

Threshold: **7**. Real MS page: 18–24 pts. AitM proxy: 10–17 pts.

To add a new signal: add a weight entry in `DETECT_WEIGHTS`, add a check function `aitm_checkXxx()`, call `add("xxx", aitm_checkXxx())` in `aitm_getScore()`, then add the label string in `community/content.js` and `pro/content.js` (both EN and DE).

## Firefox compatibility

Both editions use a compatibility shim at the top of each script:

```javascript
const _ext = typeof browser !== "undefined" ? browser : chrome;
```

Community uses MV2 for Firefox (`manifest.firefox.json`), which uses `background.scripts` instead of `service_worker`. Pro same.

No polyfill dependency — the shim is sufficient for the APIs used (`tabs`, `storage`, `runtime`).

## Pro edition — settings keys

All settings are stored in `chrome.storage.local` (user-editable) or `chrome.storage.managed` (Intune/policy, read-only). Managed values take precedence.

```
language            "en" | "de"
whitelistDomains    string[]
webhookEnabled      boolean
webhookUrl          string
webhookApiKey       string
trustedBadgeEnabled boolean
customColors        { accent, background, text }
customLogoUrl       string
customWarningText   string
```

The `managed_schema.json` in `pro/` defines the Intune-deployable subset (no `customColors` — those are for local branding only).

## Pro edition — webhook events

Two event types are sent to `webhookUrl`:

- `detection` — fired automatically when threshold is exceeded
- `user_report` — fired when user clicks "Report Phishing", includes `screenshot` (base64 JPEG)

Both are sent by `pro/background.js` via `fetch()` with `x-api-key` header if configured.
