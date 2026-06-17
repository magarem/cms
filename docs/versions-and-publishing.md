# Versions and Publishing

## Overview

Each site can have multiple **content versions** — independent copies of the content tree. The CMS always edits the **active edition version**. Publishing copies the active version to `production/`.

---

## Version Structure

Each version is a directory inside the site's storage root:

```
storage/mysite/
  v1/           ← draft version
  v2/           ← another draft
  production/   ← live / published version
```

Any directory name that:
- Does not start with `_` (reserved for data dirs like `_global`, `_analytics`)
- Does not start with `.` (hidden)
- Does not match the legacy backup pattern (`/backup-\d{10,}/`)

…is considered a **content version**.

---

## Active Edition Version

`_settings.json` field `activeEditionVersion` specifies which version the CMS is currently editing.

```json
{ "activeEditionVersion": "v1" }
```

All page read/write operations use this version unless an explicit `version` query param is passed.

---

## Default Site Version

`defaultSiteVersion` is used by the **site renderer** (public-facing app) as the fallback version when no edition is specified:

```json
{ "defaultSiteVersion": "production" }
```

---

## Creating a New Version

`POST /sites/:site/versions`
```json
{ "name": "v2" }
```

- Admin only
- Copies the entire active version directory to a new directory with the given name
- Adds the new name to `siteVersions` in `_settings.json`
- Sets `activeEditionVersion` to the new version

This allows branching content — e.g., create `v2` from `v1`, make changes, then publish `v2`.

---

## Publishing

`POST /sites/:site/publish`

- Admin only
- Copies the **active edition version** directory to `production/` (overwriting it)
- `production/` is the version the public site reads by default

```
v1/ (active, being edited)
  → copy all files
production/ (overwritten with v1's content)
```

---

## Version Switching in the CMS

`PUT /sites/:site/settings`
```json
{ "activeEditionVersion": "v2" }
```

Changes which version the editor reads/writes. Does not modify content.

---

## Preview by Version

The public site renderer supports a `?version=` query param (and `preview_layer` cookie) to display a non-production version:

```
https://mysite.com/?version=v2
```

The CMS preview opens the `previewUrl` with this param injected.

---

## `siteVersions` Sync

`GET /sites/:site/settings` reads the actual directories on disk and updates `siteVersions` in `_settings.json` automatically. This means if you manually add or remove a directory, the settings reflect it on the next read.

---

## Version List Filtering

When reading directories for the version list, the following are excluded:
- Directories starting with `_` (data dirs)
- Directories starting with `.` (hidden)
- Directories matching `/backup-\d{10,}/` (legacy backup dirs)
- The `_backups/` directory (new backup system)

This filtering is applied in both `sites.ts` (settings sync) and `backups.ts` (version picker for backup).
