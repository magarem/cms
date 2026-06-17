# Storage Layout

## Root

`SIRIUS_STORAGE_ROOT` env var (default: `../../../storage` relative to `cms/api/`).

```
storage/
  {site}/
    _settings.json          # Site metadata and version registry
    users.json              # Site-scoped user accounts
    _models/                # Site-specific page models (override global)
    _global/                # Global data files (shared across all pages)
    _newsletter/
      subscribers.json      # Email subscriber list
    _inscricoes/
      inscricoes.json       # Form submission records
    _analytics/             # JSONL analytics log files (one per day)
    _backups/
      _manifest.json        # Backup index
      backup-{timestamp}/   # Individual backup snapshots
    {version}/              # Content version (e.g. v1/, production/)
      _order.yml            # Root-level sibling order
      {page}/
        _index.yml          # Page data + blocks array
        _order.yml          # Child order for this directory
        content.md          # Markdown body (for ContentMD blocks)
        _collection.yml     # Presence = this dir is a collection
        {sub-page}/
          _index.yml
          ...
    {version}/media/        # Uploaded media files (nested by subfolder)
```

---

## `_settings.json`

```json
{
  "activeEditionVersion": "v1",
  "defaultSiteVersion": "production",
  "siteVersions": ["production", "v1"],
  "previewUrl": "https://mysite.com",
  "analyticsId": "UA-XXXXX",
  "breadcrumbMode": "slug",
  "blocksGap": "normal",
  "cms": {
    "sidebarWidth": 280
  }
}
```

| Field | Purpose |
|-------|---------|
| `activeEditionVersion` | Which version is currently being edited in the CMS |
| `defaultSiteVersion` | Fallback version for public site rendering |
| `siteVersions` | All available versions (auto-synced from dirs on disk) |
| `previewUrl` | Base URL for the live preview feature |
| `analyticsId` | Google Analytics or similar tracker ID |
| `breadcrumbMode` | How page paths render in breadcrumbs |
| `blocksGap` | Spacing between blocks in the editor |
| `cms.*` | CMS UI preferences (e.g. sidebar width) |

---

## `users.json`

```json
[
  {
    "id": "uuid-v4",
    "username": "admin",
    "passwordHash": "$2b$10$...",
    "role": "admin",
    "email": "admin@example.com",
    "resetToken": null,
    "resetTokenExp": null
  }
]
```

---

## Page Files

A "page" is a directory inside a version:

```
{version}/about/
  _index.yml    ← preferred; may also be _index.json
  content.md    ← optional; markdown body for ContentMD block
  _order.yml    ← child ordering
```

`_index.yml` structure:
```yaml
title: About Us
description: Who we are
blocks:
  - id: uuid
    componentName: HeroSection
    isHero: true
    active: true
    label: Hero
    props:
      heading: Welcome
      image: /media/hero.webp
seo:
  meta_title: About | Site
  meta_description: ...
  og_image: /media/og.webp
```

---

## Collection Marker

A directory is a **collection** when it contains `_collection.yml`:

```yaml
# _collection.yml — usually empty or has itemModel reference
itemModel: blog-post
```

Items inside are sub-directories, each with their own `_index.yml`.

---

## Order File

`_order.yml` controls sibling ordering in tree/listing views:

```yaml
order:
  - about
  - services
  - blog
  - contact
```

---

## Media Files

Media is stored under `{version}/media/` by default, but can be in sub-folders:

```
{version}/media/
  hero.webp
  team/
    alice.webp
    bob.webp
```

When referenced in content, paths are relative to the media root:
- `hero.webp` → served at `GET /sites/{site}/media/serve?path=hero.webp`
- `team/alice.webp` → `?path=team/alice.webp`

---

## Global Data

```
{site}/_global/
  navigation.json
  footer.yml
  social.json
```

Each file is a JSON or YAML object. Retrieved via `GET /sites/:site/global`, updated via `PUT /sites/:site/global/:key`.

---

## Backups

```
{site}/_backups/
  _manifest.json        # Array of BackupEntry
  backup-{timestamp}/   # Snapshot directory
    production/         # Copy of version dir
    v1/
    _analytics/
    _settings.json
```

`_manifest.json` entry:
```json
{
  "id": "backup-1781014295761",
  "label": "Before redesign",
  "createdAt": "2026-06-09T14:11:38.464Z",
  "size": 296431679,
  "dirs": ["production", "v1", "_analytics"]
}
```

---

## Analytics

```
{site}/_analytics/
  2026-06-09.jsonl
  2026-06-10.jsonl
```

Each line is a JSON event:
```json
{"ts":1718000000000,"path":"/about","ref":"https://google.com","ua":"Mozilla...","ip":"1.2.3.4"}
```

---

## Models

```
{site}/_models/
  blog-post.yml
  landing-page.yml
```

Global models (for all sites) can live at:
```
storage/_global_models/
  normal-page.yml
```

---

## Legacy Backup Dirs (deprecated)

Old backup system created dirs at the top level of the site with names like:
- `um2-backup-1780488851593`
- `segundo-backup-1780490607687`

These match the regex `/backup-\d{10,}/` and are filtered out by `isLegacyBackupDir()` in both `sites.ts` and `backups.ts`.
