# Site Renderer

## Overview

The **site renderer** is the public-facing layer that turns the content stored in `storage/{site}/{version}/` into a live website. Each site is its own Nuxt 4 (Nitro / Bun) app under `sites/web/<slug>/`, sharing components, composables, and a couple of utilities with `sites/shared/`.

CMS authoring happens in the `cms/` repo. Rendering happens here. The two communicate via:
- The filesystem (renderer reads `storage/` directly through `SIRIUS_STORAGE_ROOT`)
- `postMessage` when the renderer is loaded inside the CMS preview iframe — see [preview-mode.md](preview-mode.md)

---

## Directory Layout

```
sites/
  shared/
    components/         # 35+ block components (Hero, FeatureGrid, Team, …)
    composables/        # useMediaUrl, useSiriusPreview, useEditPageHotkey, …
    server/utils/       # versioning.ts — resolveFileInLayers, getActiveVersions
  web/
    <site>/             # one Nuxt app per site
      app/
        app.vue
        assets/css/main.css     # Tailwind 4 + @theme defaults
        components/             # site-specific overrides
        layouts/                # default.vue, topbar-glass.vue, post.vue, landing.vue
        pages/
          index.vue
          [...slug].vue         # catch-all page renderer
        plugins/                # site.server.ts, cms-preview.client.ts
      server/
        api/                    # content.get.ts, tree.get.ts, global.get.ts, beacon.post.ts, …
        middleware/site.ts      # resolves siteId from subdomain or env
        routes/
          data/                 # serves /data/* media via storage layers
          sitemap.xml.ts
      nuxt.config.ts
  content-api/                  # standalone Elysia API (port 3010) — public site delivery
  api/, server/, caddy/         # production glue
```

A site is **registered** purely by:
1. A directory under `storage/{site}/`
2. A PM2 entry in `cms.config.cjs` (production) or running `nuxt dev` locally

There is no central site registry beyond the storage filesystem.

---

## nuxt.config.ts — Per-Site Wiring

Each site shares the same shape — only env-driven config differs:

```ts
const sharedDir = fileURLToPath(new URL('../../shared', import.meta.url))

export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      cmsEditorUrl: process.env.NUXT_PUBLIC_CMS_EDITOR_URL || 'http://localhost:3001',
      siteId:       process.env.NUXT_PUBLIC_SITE_ID   || '',
      siteUrl:      process.env.NUXT_PUBLIC_SITE_URL  || '',
      siteName:     process.env.NUXT_PUBLIC_SITE_NAME || '',
    },
  },
  nitro: { preset: 'bun', alias: { '#shared': sharedDir } },
  app: {
    head: {
      htmlAttrs: { lang: 'pt-BR' },
      link: [{ rel: 'stylesheet', href: 'https://unpkg.com/primeicons/primeicons.css' }],
    }
  },
  components: {
    dirs: [
      { path: '~/components',          global: true }, // site-specific overrides win
      { path: `${sharedDir}/components`, global: true },
    ]
  },
  imports: {
    dirs: ['~/composables', `${sharedDir}/composables`],
  },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
})
```

Key points:
- Same component name in `~/components` overrides the shared one — used for site-specific block variants.
- All shared composables auto-imported alongside site-specific ones.
- Nitro on Bun preset; the production process is `bun .output/server/index.mjs`.

---

## Required Environment Variables

| Var | Example | Purpose |
|-----|---------|---------|
| `SIRIUS_STORAGE_ROOT` | `/home/maga/dev/sirius-eco-system/storage` | Filesystem root for all content |
| `NUXT_SITE_ID` | `patricia-indica` | Site directory name (server-side fallback when subdomain detection fails) |
| `NUXT_PUBLIC_SITE_ID` | `patricia-indica` | Same value, exposed to client |
| `NUXT_PUBLIC_SITE_URL` | `https://patricia-indica.siriusstudio.site` | Used in SEO, sitemap, share links |
| `NUXT_PUBLIC_SITE_NAME` | `Patricia Indica` | Display name |
| `NUXT_PUBLIC_CMS_EDITOR_URL` | `https://cms.siriusstudio.site` | Link out to the CMS editor from preview affordances |

---

## Site Identification — `server/middleware/site.ts`

Every request resolves a `siteId` into `event.context.siteId`:

```ts
export default defineEventHandler((event) => {
  // 1. Explicit header from reverse proxy
  const explicit = getHeader(event, 'x-site-id')
  if (explicit) { event.context.siteId = explicit; return }

  // 2. Subdomain (production)
  const host = (getHeader(event, 'x-forwarded-host') || getHeader(event, 'host') || '').split(':')[0]
  const subdomain = host.split('.')[0]
  if (!subdomain || subdomain === 'localhost' || /^127\./.test(subdomain)) {
    event.context.siteId = process.env.NUXT_SITE_ID || 'default'
    return
  }
  event.context.siteId = subdomain
})
```

In production, Caddy injects `X-Site-Id` per virtual host. In dev, the env var is the source of truth.

---

## Version Resolution — `sites/shared/server/utils/versioning.ts`

Content is layered across versions. `getActiveVersions(siteId, previewLayer)`:

1. Reads `storage/{site}/_settings.json`
2. Returns `[defaultSiteVersion, activeEditionVersion]` (deduped) — falls back to `["v1"]`
3. If `previewLayer` is present (from `?version=` or `preview_layer` cookie), prepends it

`resolveFileInLayers(siteId, relativePath, previewLayer)` walks those versions in order and returns the first existing file. JSON files containing `{ "_deleted": true }` are treated as tombstones (returns `{ error: 'deleted_tombstone' }`).

This is the mechanism that lets `production` be the public default while editors preview `v1`.

---

## Server API Routes

Each site exposes a small Nitro API. All routes pull `siteId` from middleware context and `previewVersion` from `?version=` query or `preview_layer` cookie.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/content?path=<page>` | Resolve a page from layered storage. Tries `<path>`, `<path>.json`, `<path>.yml`, `<path>/_index.{json,yml,md}` in turn. Returns `{ data, _layer }` plus `_isCollectionItem` flag. Parses YAML via `gray-matter`. Markdown returns `{ type: 'markdown', md_data, md_content }`. |
| `GET /api/tree?path=<dir>` | Read a directory and return its child pages. Honours `_order.yml` for sorting. Skips `_`-prefixed and `.`-prefixed dirs. |
| `GET /api/global?key=<name>` | Read a single `_global/<name>.json` or `.yml`. |
| `GET /api/site-config` | Returns the parts of `_settings.json` + `_cms.json` the client needs (`siteUrl`, `breadcrumbMode`, `blocksGap`, `googleAnalyticsId`). |
| `POST /api/newsletter` | Forward newsletter signups to the CMS API. |
| `POST /api/beacon` | Self-hosted analytics — POSTs `{ path, ref }` to the CMS analytics endpoint. Skipped when `preview_layer` cookie is set. |
| `POST /api/clear-cache` | Used by the CMS to invalidate Nitro cache after a publish. |
| `GET /routes/data/**` | Serves media files from `storage/{site}/{version}/{path}`. Used by `useMediaUrl`. |
| `GET /sitemap.xml` | Generated from the page tree. |

---

## Page Renderer — `app/pages/[...slug].vue`

Single catch-all that handles every page. Fetches `/api/content`, splits the block array into hero vs. content blocks, dynamically resolves block component names via `resolveComponent`, and renders.

```ts
const allBlocks     = computed(() => (pageContent.value?.blocks || []).filter(b => b.active !== false))
const heroBlocks    = computed(() => allBlocks.value.filter(b => b.isHero === true || b.isHero === 'true'))
const contentBlocks = computed(() => allBlocks.value.filter(b => !b.isHero || b.isHero === 'false'))

const layoutName = computed(() => heroBlocks.value.length > 0 ? 'topbar-glass' : 'default')
```

Layout selection:
- `topbar-glass` when at least one hero block is present (transparent topbar over the hero)
- `default` otherwise
- A page's `layout` field in `_index.yml` can override (`post`, `landing`, etc.)

Page-level images (`image`, `sideimages`, `sideimages_position`) are resolved with `useMediaUrl` and rendered between the hero and content blocks.

---

## Block Rendering Contract

Every block in a page's `_index.yml` is:

```yaml
- id: "01HXY..."         # UUID for editor targeting
  componentName: "Hero"  # resolves to sites/shared/components/Hero.vue (or override)
  isHero: true           # routed into the hero layout slot
  active: true           # false = skip rendering
  props:                 # passed directly to the component
    title: "..."
    image: "team/photo.webp"
```

The renderer injects two extra props automatically:
- `pagePath` — the current page's slug, used by `useMediaUrl` for bare-filename resolution
- (optionally) `data` for blocks that read page metadata (collection items, etc.)

See [block-authoring.md](block-authoring.md) for how to write a block.

---

## Theme System — `_global/theme.json`

Theme values are runtime CSS variables read at request time and injected into `<head>` from `app.vue`:

```ts
const { data: themeFile } = await useFetch('/api/content', {
  key: 'site-theme',
  query: { path: '_global/theme' }
})

useHead({
  style: [{
    innerHTML: computed(() => {
      const t = themeFile.value?.data
      const light = Object.entries(t.light ?? {}).map(([k, v]) => `  ${k}: ${v};`).join('\n')
      const dark  = Object.entries(t.dark  ?? {}).map(([k, v]) => `  ${k}: ${v};`).join('\n')
      return `:root {\n${light}\n}${dark ? `\n.dark {\n${dark}\n}` : ''}`
    })
  }]
})
```

`theme.json` shape:

```json
{
  "light": {
    "--color-primary":    "#230b9d",
    "--color-secondary":  "#0F172A",
    "--color-accent":     "#F59E0B",
    "--color-bg-base":    "#FFFFFF",
    "--color-bg-muted":   "#F8FAFC",
    "--color-text-main":  "#1E293B",
    "--color-text-muted": "#64748B",
    "--color-border":     "#E2E8F0",
    "--font-sans":  "'Inter', system-ui, sans-serif",
    "--font-serif": "'Merriweather', serif",
    "--radius-botao":  "12px",
    "--radius-cartao": "24px",
    "--max-width-site":    "1440px",
    "--max-width-content": "1200px",
    "--max-width-copy":    "800px"
  },
  "dark": {
    "--color-bg-base":    "#0f172a",
    "--color-bg-muted":   "#1e293b",
    "--color-text-main":  "#f8fafc",
    "--color-text-muted": "#94a3b8",
    "--color-border":     "#334155",
    "--color-primary":    "#3b82f6"
  }
}
```

### Tailwind 4 Integration

`app/assets/css/main.css` declares the same variable **names** as `@theme` so Tailwind generates utilities for them:

```css
@import "tailwindcss";
@source "../../../../../shared/**/*.vue";

@theme {
  --variant-dark: .dark &;

  --color-primary:    #d81da6;   /* fallback */
  --color-bg-base:    #FFFFFF;
  /* ... */
}
```

The result: classes like `bg-bg-base`, `text-text-main`, `text-primary`, `border-border`, `bg-bg-muted` are recognised by Tailwind, and their actual values come from `theme.json` at render time. Dark mode is toggled by adding `.dark` to `<html>`.

Block components MUST use these semantic classes — see [block-authoring.md](block-authoring.md).

---

## Media — `useMediaUrl()`

```ts
import { useMediaUrl } from '#shared/composables/useMediaUrl'

const { resolve } = useMediaUrl(() => props.pagePath)
const src = resolve(props.image)
```

Resolution rules (in order):

| Input | Result |
|-------|--------|
| `http://…` or `data:…` | returned unchanged |
| starts with `data/` (or `/data/`) | passed through with leading slash |
| bare filename + `pagePath` given | `/data/{pagePath}/{filename}` |
| absolute path `/foo/bar.jpg` | `/data{path}` → `/data/foo/bar.jpg` |
| relative path `team/alice.webp` | `/data/team/alice.webp` |

The `/data/*` routes are served by `server/routes/data/[...].ts`, which calls `resolveFileInLayers` to find the file in the active version stack and returns its bytes.

**Always pass `pagePath` as a getter** (`() => props.pagePath`) so it is re-evaluated when the prop changes. Capturing it at setup time breaks the bare-filename rule for dynamic pages.

---

## Preview Mode Affordances

When the renderer detects `?version=` or a `preview_layer` cookie, it is in **preview mode** and exposes edit affordances. `useSiriusPreview()` returns:

```ts
const { isInIframe, isPreview } = useSiriusPreview()
// isInIframe — window !== window.parent
// isPreview  — !!route.query.version || !!preview_layer cookie
```

In `[...slug].vue`, hover-edit buttons emit `sirius:editBlock`:

```ts
function editBlock(block, blockIndex) {
  if (!isInIframe.value) return
  window.parent.postMessage(
    { type: 'sirius:editBlock', blockId: block.id, blockIndex, pagePath: targetUrl.value },
    '*'
  )
}
```

And `app/plugins/cms-preview.client.ts` forwards every route change to the parent:

```ts
router.afterEach((to) => {
  if (window.self !== window.top) {
    window.parent.postMessage({ type: 'sirius:navigate', path: to.path }, '*')
  }
})
window.addEventListener('message', (e) => {
  if (e.data?.type === 'sirius:goto') router.push(e.data.path)
})
```

See [preview-mode.md](preview-mode.md) for the full protocol.

---

## Layouts

`app/layouts/` typically contains:

| Layout | When used |
|--------|-----------|
| `default.vue` | Standard pages — solid topbar |
| `topbar-glass.vue` | Auto-selected when the page has a hero block — transparent topbar over the hero |
| `post.vue` | Selected when `_index.yml.layout === "post"` — article reading layout |
| `landing.vue` | Selected when `_index.yml.layout === "landing"` — full-bleed marketing layout |

All read header/menu/footer from `_global/topbar.json` and `_global/footer.yml` via the shared `SiteHeader`, `SiteHeaderMenu`, `Footer` components.

---

## Analytics Beacon

```ts
// app.vue
router.afterEach((to) => {
  if (previewCookie.value) return
  fetch('/api/beacon', {
    method: 'POST',
    body: JSON.stringify({ path: to.path, ref: document.referrer }),
    keepalive: true,
  }).catch(() => {})
})
```

`/api/beacon` forwards the event to the CMS API's `/sites/:site/beacon` endpoint, which appends to the JSONL analytics file. Suppressed when previewing.

Google Analytics is loaded conditionally if `googleAnalyticsId` is set in `_cms.json` — script tags are injected via `useHead`.

---

## Cache Invalidation

After a CMS publish, the CMS API calls `POST <siteUrl>/api/clear-cache` to flush Nitro's cache. The renderer simply calls `cache.clear()` and returns 200.

---

## Adding a New Site

1. Create `storage/{slug}/` with `users.json` (CMS auth), `_settings.json`, and a `v1/` content directory.
2. Copy an existing site under `sites/web/` to `sites/web/{slug}/` — usually `paravyoma2` is a good starting point.
3. Edit `nuxt.config.ts` if anything site-specific is needed (rarely).
4. Add a PM2 entry in `cms.config.cjs`:
   ```js
   {
     name: "site:slug",
     cwd: "./sites/web/slug",
     script: ".output/server/index.mjs",
     interpreter: BUN,
     env_production: {
       PORT: <unique port>,
       SIRIUS_STORAGE_ROOT: STORAGE,
       NUXT_SITE_ID: "slug",
       NUXT_PUBLIC_SITE_ID: "slug",
       NUXT_PUBLIC_SITE_URL: "https://slug.siriusstudio.site",
       NUXT_PUBLIC_SITE_NAME: "Display Name",
       NUXT_SITES_API_URL: "http://localhost:3010",
       NUXT_PUBLIC_CMS_EDITOR_URL: "https://cms.siriusstudio.site",
     },
   }
   ```
5. Add a Caddy block routing the subdomain to the new port.
6. Build (`bun run build`) and `pm2 reload cms.config.cjs --update-env`.

The CMS UI will pick up the site as soon as `storage/{slug}/users.json` exists.
