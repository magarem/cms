# Global Data

## Overview

**Global data** is site-wide structured content not tied to any specific page. Navigation menus, footer links, social handles, and other shared configuration live here.

---

## Storage

```
storage/{site}/_global/
  navigation.json
  footer.yml
  social.json
  contacts.json
```

Each file is a JSON or YAML object (or array). File name becomes the **key** used to read/write it.

---

## API Endpoints

### Read all global data
```
GET /sites/:site/global
→ {
    "navigation": { ... },
    "footer": { ... },
    "social": { ... }
  }
```
Returns all `_global/*.json` and `_global/*.yml` files merged into a single object keyed by filename (without extension).

### Write a global file
```
PUT /sites/:site/global/:key
{ "links": [...], "logo": "logo.webp" }
```
Writes to `_global/{key}.json` (or `.yml` if that extension already exists).

---

## UI — `global.vue`

- Lists all global keys as expandable panels
- Each key's value is edited via `PropForm` (auto-inferred types from JSON structure)
- Changes are saved immediately on blur or explicit "Guardar"

---

## Common Global Files

| Key | Typical content |
|-----|----------------|
| `navigation` | Menu items (label, link, children) |
| `footer` | Footer columns, links, copyright text |
| `social` | Social media URLs (instagram, facebook, etc.) |
| `contacts` | Phone, email, address |
| `theme` | Color overrides, font choices |

---

## Usage in Site Renderer

The site renderer (Nuxt) fetches global data via its own content API:
```
GET /api/global?key=navigation
```
This calls through to the CMS API internally.

---

## Versioning Note

Global data in `_global/` is **not versioned** — it is shared across all versions of the site. If you need versioned global data, store it inside a version directory instead.
