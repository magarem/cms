# Page Editor

## Overview

The page editor (`pages/[site]/pages/[...slug].vue`) is the main content editing interface. It renders the block list, frontmatter fields, markdown editor, and SEO fields for a single page.

---

## Block Editor — `BlockEditor.vue`

Renders the ordered list of blocks for a page. Supports:
- **Drag to reorder** (via `vue-draggable-plus`)
- **Add block** (opens `AddBlockModal`)
- **Toggle active** per block
- **Delete block** (admin only)
- **Collapse/expand** block card

```vue
<BlockEditor v-model="page.blocks" :site="site" :page-path="path" />
```

Emits an updated blocks array on any change; the parent page component saves on blur or explicit save.

---

## Block Card — `BlockCard.vue`

Each block is rendered inside a `BlockCard`:
- Header: `label` (or `componentName`), active toggle, collapse arrow, delete button
- Body: `PropForm` with the block's `props`

---

## Add Block Modal — `AddBlockModal.vue`

Opened by the "+" button in `BlockEditor`.
- Lists all available components from the **component registry** (via `useComponentSchema()`)
- Components are grouped by category
- Selecting a component calls `buildDefaultProps(schema)` to generate initial prop values
- A new block object is pushed to the blocks array with a fresh UUID

---

## PropForm — `PropForm.vue`

Renders a set of `PropField` components for a given props object and its schema.

```vue
<PropForm v-model="block.props" :schema="componentSchema" :site="site" />
```

---

## PropField — `PropField.vue`

The core field renderer. Auto-infers field type from schema or value. Supported field types:

| Type | Input rendered |
|------|---------------|
| `text` / `string` | `<UInput>` |
| `textarea` | `<UTextarea>` |
| `toggle` / `boolean` | `<UToggle>` |
| `select` | `<USelect>` with `options` from schema |
| `color` | Color picker input |
| `date` | Date input |
| `image` | `MediaPicker` (single image) |
| `media-array` | `MediaPicker` (multi-select) |
| `string-array` | Dynamic list of text inputs |
| `object` | Nested `PropForm` |
| `object-array` | Repeatable `PropForm` rows (drag to reorder via `VueDraggable`) |
| `markdown` | Markdown textarea |
| `richtext` | Rich text editor |

Field type is determined by:
1. `type` property in schema definition
2. Fallback inference from value type (`boolean` → toggle, `Array` → string-array, etc.)

---

## Media Picker — `MediaPicker.vue`

Inline popover that lets the user browse and select media files.
- Shows files from `GET /sites/:site/media?path=`
- Supports folder navigation
- Single or multi-select mode
- Previews images inline
- Emits selected path(s) back to `PropField`

---

## Component Schema — `useComponentSchema.ts`

Loads the component registry from `GET /sites/:site/components`.

The registry is a JSON file maintained per site (or per site template) that maps component names to their prop schemas:

```json
{
  "HeroSection": {
    "group": "Hero",
    "label": "Hero Section",
    "props": {
      "heading": { "type": "text", "label": "Heading" },
      "image":   { "type": "image", "label": "Background Image" },
      "ctaText": { "type": "text", "label": "Button text" },
      "ctaLink": { "type": "text", "label": "Button URL" }
    }
  }
}
```

Exposed by the composable:
- `blockComponents` — flat list of all component names
- `componentGroups` — grouped by `group` field
- `getSchema(name)` — schema for one component
- `buildDefaultProps(schema)` — build empty default props object

---

## Frontmatter Fields

Above the blocks, the editor shows editable frontmatter fields (title, description, slug, custom fields defined in the assigned model).

---

## Markdown Editor

Pages with a `ContentMD` block show an inline markdown textarea that reads/writes `content.md` via:
- `GET /sites/:site/markdown?path={pagePath}`
- `PUT /sites/:site/markdown`

---

## SEO Panel

Collapsible panel at the bottom of the page editor for:
- `meta_title`, `meta_description`, `keywords`
- `og_image` (uses `MediaPicker`)
- `canonical`, `robots`, `schema_type`

---

## Save Flow

1. User edits any field (block prop, frontmatter, markdown)
2. Changes are tracked in local reactive state
3. On explicit "Guardar" button or auto-save trigger:
   - `PUT /sites/:site/page` → writes `_index.yml`
   - `PUT /sites/:site/markdown` → writes `content.md` (if markdown block exists)
4. Success toast shown; dirty state reset

---

## Preview

The "Preview" button in `CmsTopbar` opens the site's `previewUrl` in an iframe (or new tab) with `?version={activeVersion}` to show a draft preview.  
The preview page can communicate back via `postMessage` to trigger block edit jumps.
