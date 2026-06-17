# Preview Mode

## Overview

Preview mode shows the live site rendered inside an iframe alongside a floating toolbar that lets the editor change page, viewport, and content version without leaving the CMS. It is the bridge between the block editor and the deployed site renderer.

Route: `/[site]/preview` — layout `preview` (no sidebar, full-bleed).

---

## How It Works

The CMS embeds the site renderer in an iframe whose URL comes from `cmsConfig.previewUrl` (configured in site settings). The renderer reads `?version=<v>` from the query string to choose which content version to serve.

```
iframe src = `${cmsConfig.previewUrl}${path}?version=${selectedVersion}`
```

The iframe `:key` is bound to `selectedVersion`, so switching versions forces a full reload. Switching **pages** does **not** reload — it uses `postMessage` so client-side routing stays intact.

If `cmsConfig.previewUrl` is empty the page shows a placeholder linking to settings.

---

## Toolbar

A 44px floating bar pinned to the top, glassy dark background. Hidden after 3 seconds of inactivity, reappears on mouse-enter (`toolbar-enter` / `toolbar-leave` transitions).

| Control | Behaviour |
|---------|-----------|
| **Back** | `router.back()` — usually returns to the editor |
| **Edit page** | NuxtLink to `/[site]/pages{currentPath}` — opens block editor for the page being previewed |
| **Page picker** | `USelect` populated from flattened site tree. Changing it sends `sirius:goto` (no reload) |
| **URL input** | Editable address bar. Pressing Enter navigates the iframe via `sirius:goto`. Mirrors `selectedPath`. |
| **Copy URL** | Copies current full URL (including `?version=`) to clipboard, with 2s "Copiado!" confirmation |
| **Version** | `USelect` over `settings.siteVersions`. Changing forces iframe reload via `:key="selectedVersion"` |
| **Viewport** | Three buttons — Desktop (100%), Tablet (768px), Mobile (390px) |
| **Open in tab** | `window.open(displayUrl, '_blank')` |

---

## postMessage Protocol

The CMS preview and the site renderer communicate via `window.postMessage`. All messages are objects with a `type` field prefixed `sirius:`.

### CMS → iframe

| Type | Payload | Purpose |
|------|---------|---------|
| `sirius:goto` | `{ path: string }` | Tells the renderer to navigate to a new path without a full reload (renderer does `router.push(path)`) |

### iframe → CMS

| Type | Payload | Action |
|------|---------|--------|
| `sirius:navigate` | `{ path: string }` | User clicked a link inside the iframe — updates `selectedPath` so toolbar reflects current page |
| `sirius:editBlock` | `{ blockId?, blockIndex?, arrayProp?, arrayIndex?, pagePath? }` | User clicked a block's edit affordance — CMS navigates to `/[site]/pages/{page}?block=…&blockIndex=…&arrayProp=…&arrayIndex=…` |
| `sirius:gotoCollection` | `{ collectionPath: string }` | User opened a collection in-frame — CMS navigates to `/[site]/collections/{collectionPath}` |
| `sirius:gotoGlobal` | `{ section, blockId?, blockIndex? }` | User clicked something rendered from `_global/` — CMS navigates to `/[site]/global?section=…&block=…&blockIndex=…` |

The renderer side must wrap clickable surfaces with an "edit" affordance (typically visible only in preview mode, detected by `?version=v1` or a parent-window marker) and emit these events on click.

---

## Viewports

```ts
{ id: "desktop", width: "100%"  }
{ id: "tablet",  width: "768px" }
{ id: "mobile",  width: "390px" }
```

Tablet/mobile render the iframe inside a centred "device shell" with a thin label and rounded corners. Desktop fills the container.

---

## Data Loaded

```ts
GET /sites/:site/settings   → { siteVersions: [...], activeEditionVersion, cmsConfig: { previewUrl } }
GET /sites/:site/tree       → tree[] for page picker
```

`useAsyncData` keyed on `site` + page name, so navigating away and back doesn't refetch unnecessarily.

---

## Initial State

- `selectedPath` defaults to `route.query.path` if present, otherwise `/`
- `selectedVersion` defaults to `settings.activeEditionVersion`, falling back to `"v1"`
- Toolbar starts visible; the auto-hide timer starts on user activity (mouseenter handlers reset it)

---

## Settings Dependency

The Preview page is gated by `cmsConfig.previewUrl`. Set this in **Configurações → Preview** (the site settings page). Typically it is the public URL of the site renderer dev server or a staging deployment:

```
http://localhost:3000              # local sites/web dev server
https://staging.example.com        # staging
```

The renderer must accept `?version=v1` (or whatever version is selected) and serve content from `storage/{site}/{version}/`.

---

## Editor Round-Trip

The "Edit page" toolbar link and the inbound `sirius:editBlock` message both navigate to the CMS editor for the page currently being previewed. This is what enables the "click a block on the live page → land directly in its editor" workflow.

The URL is built as:

```
/[site]/pages/{pagePath}?block={blockId}&blockIndex={n}&arrayProp={name}&arrayIndex={i}
```

`pagePath` defaults to `home` when previewing `/`. The editor reads these query params to scroll to and open the specific block on mount.
