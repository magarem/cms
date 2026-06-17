# Page Models

## Overview

A **model** is a reusable template that defines the default block structure and field schema for new pages or collection items. When a page is created with a model, its blocks and props are pre-populated from the template.

---

## Model Storage

Models are YAML files stored per site or globally:

```
storage/{site}/_models/
  blog-post.yml
  landing-page.yml
  team-member.yml

storage/_global_models/      ← optional global fallback
  normal-page.yml
```

Site models take precedence over global models when names conflict.

---

## Model Schema

```yaml
name: blog-post
label: "Blog Post"
description: "Standard blog article layout"
target: collection-item     # page | collection-item | any
fields:
  - key: title
    label: Título
    type: text
    required: true
  - key: author
    label: Autor
    type: text
  - key: publishedAt
    label: "Data de publicação"
    type: date
blocks:
  - componentName: HeroPost
    isHero: true
    label: "Post Hero"
    props:
      heading: ""
      image: ""
  - componentName: ContentMD
    label: Conteúdo
    props:
      pagePath: ""          # filled by applyModel()
```

---

## Fields

Model fields define the **frontmatter** of a page (non-block data):

| Property | Values |
|----------|--------|
| `key` | Field key in `_index.yml` |
| `label` | Display name in the editor |
| `type` | `text`, `textarea`, `toggle`, `select`, `date`, `image`, `color` |
| `required` | boolean |
| `options` | Array of `{ label, value }` for `select` type |
| `default` | Default value |

---

## Block Templates

The `blocks` array in a model defines the **starter blocks** for new pages. When `applyModel()` is called:
- Each block gets a fresh `id` (UUID)
- `ContentMD` blocks get `props.pagePath` set to the new page path
- `ChildGrid` blocks get `props.parentPath` set to the new page path

---

## Target

| Value | Used for |
|-------|---------|
| `page` | Regular pages only |
| `collection-item` | Collection items only |
| `any` | Both |

The UI filters models by target when prompting for model selection.

---

## API Endpoints

### List models
```
GET /sites/:site/models
```
Returns all models (site + global merged, site overrides global).

### Get model
```
GET /sites/:site/models/:name
```

### Create / update model
```
POST /sites/:site/models
{
  "name": "blog-post",
  "label": "Blog Post",
  "target": "collection-item",
  "fields": [...],
  "blocks": [...]
}
```
Saves to `storage/{site}/_models/{name}.yml`.

### Delete model
```
DELETE /sites/:site/models/:name
```
Admin only.

---

## Using Models in New Pages

When creating a page or collection item, pass a `model` name:

```
POST /sites/:site/page
{ "path": "blog/new-post", "model": "blog-post" }
```

`applyModel()` in `lib/models.ts` applies the model's block templates to the new page's `_index.yml`.

If no model is specified, `resolveDefaultModel(site)` tries to find a model named `normal-page`. If none exists, `defaultPageTemplate(slug)` generates a minimal `ContentMD`-only template.

---

## Model Editor — `models/[name].vue`

The UI for creating/editing models provides:
- Name, label, description, target fields
- **Fields editor**: drag-to-reorder list of field definitions
- **Blocks editor**: list of block templates with their props (uses `PropForm`)
- Save/delete buttons

---

## `lib/models.ts` Helpers

| Function | Purpose |
|----------|---------|
| `listModels(site)` | Load all models from site + global dirs |
| `getModel(site, name)` | Find one model by name |
| `saveModel(site, model)` | Write model YAML to `_models/` |
| `deleteModel(site, name)` | Delete model file |
| `applyModel(model, ctx)` | Apply model template to new page (set IDs, pagePath) |
| `resolveDefaultModel(site)` | Find `normal-page` model or return null |
| `defaultPageTemplate(slug)` | Fallback: ContentMD block only |
| `sanitizeName(name)` | Slugify model name |
