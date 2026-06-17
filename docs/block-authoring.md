# Block Authoring

## Overview

A **block** is a self-contained Vue component placed by the CMS editor inside a page. This guide describes how to write a new one so it slots into both the public renderer and the CMS editor without friction.

A block has two halves:
1. The **runtime component** at `sites/shared/components/<Name>.vue` — what visitors see.
2. The **registry entry** in `cms/ui/app/data/components.json` — what the editor knows how to render inputs for.

The runtime component is the source of truth for behaviour; the registry is the source of truth for the editor UI. They must agree on prop names.

See [blocks.md](blocks.md) for the catalogue of existing blocks and their props.

---

## Minimum Viable Block

The smallest useful block:

```vue
<!-- sites/shared/components/Callout.vue -->
<script setup>
const props = defineProps({
  title:    { type: String, default: 'Heads up' },
  message:  { type: String, default: '' },
  variant:  { type: String, default: 'info' }, // 'info' | 'warning' | 'success'
})

const variantClass = computed(() => ({
  info:    'bg-primary/10 text-primary border-primary/30',
  warning: 'bg-amber-50 text-amber-900 border-amber-300',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-300',
}[props.variant] || 'bg-primary/10 text-primary border-primary/30'))
</script>

<template>
  <section class="py-8 px-4">
    <div class="max-w-3xl mx-auto p-5 rounded-xl border" :class="variantClass">
      <h3 class="font-bold text-lg mb-1">{{ title }}</h3>
      <p v-if="message" class="text-sm leading-relaxed">{{ message }}</p>
    </div>
  </section>
</template>
```

And its registry entry in `components.json`:

```json
{
  "name": "Callout",
  "category": "block",
  "description": "Inline highlighted callout box.",
  "props": [
    { "name": "title",   "label": "Título",   "type": "text",     "default": "Heads up" },
    { "name": "message", "label": "Mensagem", "type": "textarea", "default": "" },
    { "name": "variant", "label": "Estilo",   "type": "select",   "default": "info",
      "options": [
        { "value": "info",    "label": "Informação" },
        { "value": "warning", "label": "Aviso"      },
        { "value": "success", "label": "Sucesso"    }
      ]
    }
  ]
}
```

That is enough for the editor to add it to a page and the renderer to display it.

---

## Conventions That Are Load-Bearing

These are not optional — break them and either the editor or the renderer misbehaves.

### 1. The component's filename matches `componentName`

`sites/shared/components/Callout.vue` ↔ `componentName: "Callout"` in `_index.yml` ↔ `"name": "Callout"` in `components.json`. Nuxt auto-imports the component by filename so the renderer's `resolveComponent('Callout')` works.

### 2. Every prop the user can edit must exist on both sides

If `components.json` lists a prop the component doesn't accept, the editor will silently fail to apply it. If the component reads a prop not in `components.json`, editors have no way to set it (unless it's wired internally — see "Auto-injected props").

### 3. Use semantic CSS variables for theming

Bake in theme tokens, not hex colours. The site theme (`_global/theme.json`) drives them at runtime, so a block written against semantic classes Just Works across every site.

| Token | Tailwind class | Use for |
|-------|----------------|---------|
| `--color-bg-base`    | `bg-bg-base`    | page / card background |
| `--color-bg-muted`   | `bg-bg-muted`   | subtle section background |
| `--color-text-main`  | `text-text-main` | primary text |
| `--color-text-muted` | `text-text-muted` | secondary text |
| `--color-primary`    | `bg-primary`, `text-primary`, `border-primary`, `ring-primary` | accent / CTA |
| `--color-border`     | `border-border` | dividers |
| `--font-serif`       | `font-serif`    | headings |
| `--radius-botao`     | — | button radius (use `rounded-xl` to approximate, or use the var directly via `style`) |

Hard-coded colours are acceptable only when the design genuinely demands it (e.g. a fixed brand-coloured CTA button). Hero overlays are a typical exception.

### 4. Pass `pagePath` to `useMediaUrl` as a getter

```js
const { resolve } = useMediaUrl(() => props.pagePath)
```

Not `useMediaUrl(props.pagePath)`. The getter form re-evaluates per call so the bare-filename → `/data/{pagePath}/{filename}` rule still applies after navigation.

### 5. Block components should be SSR-safe

The renderer pre-renders blocks on the server. Anything that touches `window`, `document`, `IntersectionObserver`, etc. must be wrapped in `onMounted` or guarded with `if (typeof window === 'undefined') return`. See `StatsBar.vue` for an example — the counter animation only sets up the observer on mount.

---

## Anatomy of a Real Block

`Hero.vue` shows the common pattern:

```vue
<script setup>
const props = defineProps({
  badge:       String,
  title:       String,
  description: String,
  image:       String,
  pagePath:    { type: String, default: '' },
  video:       String,
  btnLabel:    String,
  btnLink:     String,
  ctaLabel:    String,
  ctaLink:     String,
})

const { resolve } = useMediaUrl(() => props.pagePath)
const resolvedImage = computed(() => resolve(props.image || ''))
</script>

<template>
  <section class="hero-section bg-[#421406]">
    <div class="absolute inset-0 z-0">
      <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/60 z-10"></div>
      <img v-if="resolvedImage && !video" :src="resolvedImage" alt="" class="hero-video object-cover" />
      <video v-if="video" autoplay muted loop playsinline :poster="resolvedImage || undefined" class="hero-video">
        <source :src="video" type="video/mp4">
      </video>
    </div>
    <div class="hero-content container mx-auto px-6">
      <!-- ... -->
    </div>
  </section>
</template>
```

Notes:
- Plain `defineProps`, no validators. The CMS picks types from `components.json`.
- `pagePath` is always declared so the same component works for `/about`, `/blog/foo`, etc.
- Hero blocks set `isHero: true` in the page YAML, which routes them into the topbar-glass layout slot — see [site-renderer.md](site-renderer.md).

---

## Prop Field Types

`PropField.vue` maps the `type` in `components.json` to an editor widget. The values the user picks are written verbatim into the block's `props` object in `_index.yml`. Pick the type that matches what your component expects.

| Field type | Saved as | Use for |
|------------|----------|---------|
| `text` | string | short string |
| `textarea` | string | multi-line copy |
| `markdown` | string | rich text |
| `number` | number | counters, columns, durations |
| `boolean` / `toggle` | boolean | visibility flags |
| `select` | string (one of `options`) | enums |
| `url` | string | links |
| `email` | string | emails (use as `mailto:` target inside the component) |
| `color` | string (hex) | per-block colour override |
| `date` | string (ISO date) | event date, post date |
| `icon` | string (PrimeIcons class, e.g. `pi-bolt`) | small icons next to titles |
| `image` | string (media path) | single image — resolve with `useMediaUrl` |
| `video` | string (media path) | background or showcase video |
| `media` | string (media path) | accepts image / video / audio |
| `image-array` | array of paths | galleries, slideshows |
| `media-array` | array of paths | mixed media galleries |
| `string-array` | array of strings | tags, bullet points |
| `path` | string (CMS tree path) | "Link to page" pickers |
| `object` | `{ ... }` | grouped sub-fields (declare with `fields: [ ... ]`) |
| `array` | `[ { ... } ]` | repeatable items (declare with `itemSchema: { ... }`) |
| `object-array` | `[ { ... } ]` | alias used in some components for `array` of objects |

### Repeatable items — `array` + `itemSchema`

```json
{
  "name": "items",
  "label": "Items",
  "type": "array",
  "default": [],
  "itemSchema": [
    { "name": "icon",        "type": "icon",     "label": "Ícone" },
    { "name": "title",       "type": "text",     "label": "Título" },
    { "name": "description", "type": "textarea", "label": "Descrição" }
  ]
}
```

The component sees `props.items` as `[{ icon, title, description }, ...]`. Render with `<div v-for="(item, i) in items" :key="i">`.

### Grouped sub-fields — `object` + `fields`

```json
{
  "name": "seo",
  "type": "object",
  "default": {},
  "fields": [
    { "name": "meta_title",       "type": "text",     "default": "" },
    { "name": "meta_description", "type": "textarea", "default": "" }
  ]
}
```

The component receives `props.seo.meta_title`, etc.

### `description` and `group`

Add a `"description"` to a prop and the editor shows it as inline help.  
Set `"group": "name"` on multiple props and the editor folds them into a collapsible section labelled `name` — useful for SEO blocks and page-image sets.

---

## Auto-injected Props

The renderer adds these to every block automatically — declare them in your component but don't expose them in `components.json` (they aren't user-editable):

| Prop | Source | Used for |
|------|--------|----------|
| `pagePath` | current route slug | `useMediaUrl` bare-filename resolution |
| `data` (sometimes) | the page's frontmatter | reading title, date, cover image from page metadata (e.g. `PageHeader` for collection items) |

If your block needs `pagePath`, declare:

```js
defineProps({ pagePath: { type: String, default: '' } })
```

Even though the user never sets it.

---

## Mocks for Empty State

Most existing blocks ship with `MOCK` data so the renderer shows something useful when the block is added but not yet filled in:

```js
const MOCK = [
  { icon: 'pi-bolt',  title: 'Rápido',         description: '…' },
  { icon: 'pi-heart', title: 'Personalizado',  description: '…' },
]

const activeItems = computed(() => props.items?.length ? props.items : MOCK)
```

This is a convention — pages look reasonable the moment a block is dropped in, and it lets the AI page generator preview blocks with no props.

---

## Preview-Mode Edit Affordances

The renderer wraps each block in a hover-edit affordance when the page is loaded inside the CMS preview iframe (`isPreview && isInIframe`). That layer is added by `[...slug].vue`, not by the block — you do not need to do anything inside the block itself for "click → open this block in the editor" to work.

If your block needs its **own** inline edit affordance (e.g. clicking an item inside an `image-array` to jump straight to that array index), emit the same `sirius:editBlock` postMessage with `arrayProp` and `arrayIndex`:

```js
function editItem(arrayIndex) {
  if (window === window.parent) return
  window.parent.postMessage({
    type: 'sirius:editBlock',
    blockId: props.blockId,        // injected by renderer wrapper
    arrayProp: 'items',
    arrayIndex,
    pagePath: props.pagePath,
  }, '*')
}
```

See [preview-mode.md](preview-mode.md) for the full protocol.

---

## Icons

Use **PrimeIcons** for inline icons — the CMS `icon` field returns class names from this set. Include the icon stylesheet via `nuxt.config.ts`:

```ts
app: { head: { link: [{ rel: 'stylesheet', href: 'https://unpkg.com/primeicons/primeicons.css' }] } }
```

Render with:

```vue
<i class="pi" :class="item.icon || 'pi-star'" />
```

Heroicons (`UIcon` from NuxtUI) are used in the CMS UI but not in the renderer — block components stick to PrimeIcons.

---

## Adding a Block to the Registry

1. Write the component at `sites/shared/components/<Name>.vue`.
2. Add the entry to `cms/ui/app/data/components.json` — keep the array alphabetically sorted by `name` for diff sanity.
3. Validate JSON (`python3 -m json.tool cms/ui/app/data/components.json > /dev/null`).
4. Restart the CMS UI dev server (or rely on hot reload) and confirm the block appears in the "Add Block" picker.
5. Append a section to `docs/blocks.md` describing the new block's props.

The block will be available across every site immediately — there is no per-site enablement.

---

## Hiding a Block from the Picker

For blocks that should only be reachable via global slots or templates (e.g. `SiteHeader`, `Footer`, `Menu`):

```json
{
  "name": "SiteHeader",
  "cms_hidden": true,
  ...
}
```

These still render normally — they're just hidden from the "Add Block" modal.

---

## Categories

| Category | Meaning |
|----------|---------|
| `block` | Insertable in pages via the block picker |
| `layout` | Referenced from `_global/topbar.json`, `_global/footer.yml`, page wrappers — not picked from the block list |

If omitted, the editor treats the entry as `block`.

---

## Checklist Before Shipping a New Block

- [ ] Filename matches `componentName` exactly
- [ ] All editable props declared in **both** the component and `components.json`
- [ ] Uses semantic CSS variables (`bg-bg-base`, `text-text-main`, `text-primary`, …) for theming
- [ ] `pagePath` declared (if the block resolves media)
- [ ] `MOCK` fallback present so empty state looks intentional
- [ ] SSR-safe — no top-level access to `window`/`document`
- [ ] PrimeIcons used for inline icons (not Heroicons)
- [ ] Entry added to `components.json` and `docs/blocks.md`
- [ ] JSON validates
- [ ] Tested in both `default` and a hero-only page layout
