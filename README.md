# PhishGuard — Private Monorepo

Internal development repository for the PhishGuard browser extension. Contains both editions.

## Editions

| Edition | Folder | Distribution |
|---|---|---|
| **Community** | `community/` | Public GitHub → [phishguard-community](https://github.com/YOUR_ORG/phishguard-community) |
| **Pro** | `pro/` | Internal — Intune / manual deployment |

## Shared detection engine

`shared/detection.js` — used by both editions. Changes here apply to both on next build. The sync Action automatically pushes updates to the public community repo on every push to `main`.

## Build

```bash
node build.js              # all 4 variants
node build.js community    # community chrome + firefox
node build.js pro          # pro chrome + firefox
node build.js pro chrome   # single variant
```

Output: `dist/community-chrome`, `dist/community-firefox`, `dist/pro-chrome`, `dist/pro-firefox`

## Release (community)

```bash
git tag v1.x.x && git push origin v1.x.x
```

GitHub Action builds ZIPs and publishes the release to the public repo.

## Documentation

- `community/README.md` — user-facing docs (synced to public repo)
- `pro/README.md` — internal deployment and configuration reference
- `DEVELOPMENT.md` — build system and project structure
