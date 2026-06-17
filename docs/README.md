# Sirius CMS — System Documentation

A file-based, multi-site CMS built with **Bun + Elysia** (API) and **Nuxt 4 + NuxtUI 3** (UI).  
Each document in this directory describes one feature or subsystem in enough detail to understand, maintain, or regenerate it.

---

## Index

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | Overall system design, stack, monorepo layout |
| [authentication.md](authentication.md) | JWT login, cookies, password reset, roles |
| [sites-and-settings.md](sites-and-settings.md) | Site registry, `_settings.json`, CMS config |
| [storage-layout.md](storage-layout.md) | Filesystem structure for all stored data |
| [content-model.md](content-model.md) | How pages, blocks, and YAML/JSON/MD work |
| [page-editor.md](page-editor.md) | Block editor UI — PropField, PropForm, BlockCard |
| [collections.md](collections.md) | Collection pages, ordering, items |
| [versions-and-publishing.md](versions-and-publishing.md) | Draft versions, edition switching, publish to production |
| [media.md](media.md) | Upload, serve, rename, move, copy, delete media |
| [preview-mode.md](preview-mode.md) | Iframe-based live preview, viewport switcher, postMessage protocol |
| [blocks.md](blocks.md) | Block component library — all 35 blocks with props and field types |
| [block-authoring.md](block-authoring.md) | How to write a new block component — props, theming, registry |
| [site-renderer.md](site-renderer.md) | Per-site Nuxt apps, theme variables, useMediaUrl, version layering |
| [global-data.md](global-data.md) | `_global/` files — site-wide shared data |
| [models.md](models.md) | Page models, field schemas, block templates |
| [backups.md](backups.md) | Create, restore, download, upload, delete backups |
| [ai-agent.md](ai-agent.md) | AI page generation with Claude + Pexels |
| [analytics.md](analytics.md) | JSONL-based analytics — events, queries |
| [users.md](users.md) | Per-site users, roles, CRUD |
| [newsletter-and-forms.md](newsletter-and-forms.md) | Newsletter subscribers and form submissions |
| [api-reference.md](api-reference.md) | Full HTTP API endpoint reference |
| [frontend-architecture.md](frontend-architecture.md) | Nuxt SPA, composables, layouts, key components |
| [revision-history.md](revision-history.md) | Auto-snapshots on save, preview & restore revisions |
| [deployment.md](deployment.md) | Environment variables, PM2, Caddy, server setup |

---

## Quick Facts

- **API** runs on port `3002` (Bun/Elysia)
- **UI** runs on port `3001` (Nuxt 4 SPA, `ssr: false`)
- **Storage root** defaults to `../../storage` relative to `cms/api/` (env: `SIRIUS_STORAGE_ROOT`)
- **Auth** is JWT in `cms_token` httpOnly cookie, scoped per site
- **Roles**: `admin`, `editor`, `viewer`
- All UI copy is in **Portuguese (pt-PT)**
