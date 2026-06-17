# Sites and Settings

## Overview

A **site** is a top-level directory in `storage/`. A single CMS instance manages all sites. Per-site configuration is split across two files at the root of the site directory:

| File | Read by | Purpose |
|------|---------|---------|
| `_settings.json` | CMS API | Version state, edition behaviour, CMS UI preferences |
| `_cms.json` | CMS UI, site renderer | Preview URL, analytics, anything exposed to the public renderer |

The split exists because `_settings.json` evolves through the CMS publish flow (versions, lastPublished, etc.) while `_cms.json` is configuration the renderer needs to read directly at request time.

---

## Site Discovery

`GET /sites` returns the list of sites accessible to the authenticated user. The list is derived from:

1. Reading the `storage/` root directory
2. Filtering to directories that have a `users.json` file (i.e. initialised sites)
3. Checking the user's JWT — regular users only see their assigned site; root accounts (`sites: ["*"]`) see all

There is no central site registry — the filesystem is the source of truth.

---

## `_settings.json` Schema

Stored at `storage/{site}/_settings.json`. Every field is optional; the API merges defaults on read.

```json
{
  "siteVersions": ["production", "v1"],
  "activeEditionVersion": "v1",
  "defaultSiteVersion": "v1",
  "lastUpdated": "2026-05-31T19:57:13.842Z",
  "lastPublished": "2026-05-30T02:44:33.603Z",
  "publishedFrom": "v1",
  "breadcrumbMode": "parents-only",
  "blocksGap": "lg",
  "siteUrl": "https://patricia-indica.siriusstudio.site"
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `siteVersions` | `string[]` | auto-synced from disk | All content versions known to the system. The API rescans `storage/{site}/` on every read and overwrites this if it has drifted. |
| `activeEditionVersion` | `string` | `"v1"` | Version currently being edited in the CMS — drives what the editor reads and writes |
| `defaultSiteVersion` | `string` | falls back to `activeEditionVersion` | Version the public site renderer serves to visitors. Typically `"production"` once the site has been published at least once. |
| `lastUpdated` | ISO timestamp | unset | Touched on every `PUT /sites/:site/settings` |
| `lastPublished` | ISO timestamp | unset | Set by `POST /sites/:site/publish` |
| `publishedFrom` | `string` | unset | Source version of the last publish (the version that was copied into `production`) |
| `breadcrumbMode` | `"hidden" \| "parents-only" \| "complete"` | `"complete"` | Controls breadcrumb rendering in the public site. `parents-only` hides the current page. `hidden` suppresses breadcrumbs entirely. |
| `blocksGap` | `"none" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"` | Vertical gap between blocks on a rendered page (`0px / 12px / 28px / 48px / 80px`). |
| `siteUrl` | `string` | unset | Site's canonical public URL — used for sitemap, OG tags, share links |

### Auto-synced `siteVersions`

On every `GET /sites/:site/settings` the API:

1. Loads `_settings.json`
2. Lists subdirectories of `storage/{site}/` excluding `_`-prefixed, hidden, and legacy backup dirs
3. Compares to the stored `siteVersions` and rewrites `_settings.json` if they differ

This keeps the field truthful as versions are created or deleted.

---

## `_cms.json` Schema

Stored at `storage/{site}/_cms.json`. Read by both the CMS UI (preview tab) and the site renderer (`/api/site-config`).

```json
{
  "previewUrl": "https://patricia-indica.siriusstudio.site",
  "googleAnalyticsId": ""
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `previewUrl` | `string` | `""` | Base URL the CMS preview iframe points to. Typically the public deployment (`https://…`) or a local dev port (`http://localhost:10022`). See [preview-mode.md](preview-mode.md). |
| `googleAnalyticsId` | `string` | `""` | GA4 ID (e.g. `G-XXXXXXXX`). When set, the renderer injects the gtag.js script in `app.vue`. |

Any extra fields are preserved on round-trip — `PUT /sites/:site/settings` with a `cmsConfig` object overwrites the file wholesale.

---

## Vendor Settings — `_sirius/vendor.json`

Independent of any specific site. Stored at `storage/_sirius/vendor.json`. Used by the **control panel** (clients/invoices/email templates) — not the CMS. Documented here for completeness.

```json
{
  "name": "Sirius Studio",
  "logo": "logo-1717612345678.png",
  "address": "Rua das Flores 123, Lisboa",
  "phone": "+351 912 345 678",
  "email": "contact@siriusstudio.site",
  "website": "https://siriusstudio.site",
  "taxId": "PT123456789"
}
```

All fields optional. Logo files are served from `storage/_sirius/media/<file>` via `GET /admin/settings/vendor/media?file=<file>` (public, no auth, so they can be embedded in PDFs/emails).

Endpoints (root-account only):
- `GET /admin/settings/vendor`
- `PUT /admin/settings/vendor`
- `POST /admin/settings/vendor/upload` (multipart `file`)

---

## API

### Read combined settings

```
GET /sites/:site/settings
→ {
    success: true,
    settings: {
      siteVersions: ["v1", "production"],
      activeEditionVersion: "v1",
      defaultSiteVersion: "v1",
      breadcrumbMode: "parents-only",
      blocksGap: "lg",
      siteUrl: "https://...",
      lastUpdated, lastPublished, publishedFrom
    },
    cmsConfig: {
      previewUrl: "https://...",
      googleAnalyticsId: ""
    }
  }
```

Returns both `_settings.json` and `_cms.json` in one round-trip. `siteVersions` is auto-synced as described above.

### Update settings

```
PUT /sites/:site/settings
{
  activeEditionVersion?: string,
  defaultSiteVersion?:   string,
  breadcrumbMode?:       string,
  blocksGap?:            string,
  siteUrl?:              string,
  cmsConfig?:            { previewUrl?, googleAnalyticsId?, ... }
}
```

Only provided fields are updated. If `cmsConfig` is present, the **entire** `_cms.json` is overwritten with the provided object — so always read first if you want to merge.

`lastUpdated` is set automatically when any `_settings.json` field changes.

Permission: any authenticated user with role `admin` or `editor`. Viewers get 403.

### Create a new version

```
POST /sites/:site/versions
{ "name": "v2" }
```

Admin only. Copies the active version directory to a new sibling. See [versions-and-publishing.md](versions-and-publishing.md).

### Publish

```
POST /sites/:site/publish
```

Admin only. Copies `{activeEditionVersion}/` over `production/`, updates `_settings.json` (`lastPublished`, `publishedFrom`), and calls the renderer's `POST /api/clear-cache` to flush Nitro.

---

## CMS UI — `settings.vue`

The CMS settings page is grouped into sections that map to the fields above:

| Section | Fields |
|---------|--------|
| **Edição** | `activeEditionVersion` (dropdown over `siteVersions`), button to create a new version |
| **Publicação** | `lastPublished`, `publishedFrom`, "Publicar" button (copies active → production), `defaultSiteVersion` |
| **Preview** | `previewUrl` (text), open-in-tab button |
| **Analytics** | `googleAnalyticsId` |
| **Renderização** | `breadcrumbMode` (select), `blocksGap` (select), `siteUrl` |

All writes go through `PUT /sites/:site/settings`.

---

## File Layout Recap

```
storage/{site}/
  users.json              # CMS authentication for this site (per-site users)
  _settings.json          # version state + render preferences
  _cms.json               # public renderer config (preview URL, analytics)
  v1/                     # content version "v1"
  production/             # content version "production"
  _newsletter/            # newsletter subscribers
  _inscricoes/            # form submissions
  _analytics/             # JSONL beacon data
  _backups/               # versioned backups
```

See [storage-layout.md](storage-layout.md) for the full filesystem reference.
