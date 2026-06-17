# Content Model

## Overview

Content is stored as plain files (YAML, JSON, Markdown) organized in a directory tree. There is no database. Each site has one or more **versions** (content layers), and within each version, a hierarchy of **pages**.

---

## Page

A page is a **directory** inside a version folder. Its data lives in `_index.yml` (or `_index.json`).

```
storage/{site}/v1/
  home/
    _index.yml
  about/
    _index.yml
    team/
      _index.yml
```

`_index.yml` holds:
- **Frontmatter fields**: `title`, `description`, `slug`, custom fields
- **`blocks` array**: ordered list of block objects
- **`seo` object**: SEO metadata
- **`active`**: whether the page is visible

---

## Block

The fundamental unit of content. Stored inside `blocks` in `_index.yml`.

```yaml
blocks:
  - id: "550e8400-e29b-41d4-a716-446655440000"
    componentName: HeroSection
    isHero: true
    active: true
    label: "Página inicial hero"
    props:
      heading: "Bem-vindo"
      subheading: "O melhor serviço do mercado"
      image: "hero.webp"
      ctaText: "Saiba mais"
      ctaLink: "/sobre"
```

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Stable identifier (used by editor to track block) |
| `componentName` | string | Maps to a Vue component in the site's `components/` dir |
| `isHero` | boolean | If true, rendered in the hero zone (above main content) |
| `active` | boolean | If false, block is hidden without deleting |
| `label` | string | Display name in the block editor |
| `props` | object | All the editable fields for this component |

---

## Markdown Body

Pages that have a `ContentMD` block also have a `content.md` file alongside `_index.yml`:

```
about/
  _index.yml   ← blocks + frontmatter
  content.md   ← markdown body (read by ContentMD block)
```

`content.md` supports YAML frontmatter (gray-matter):
```markdown
---
title: About override (optional)
---

# About Us

We are a team of...
```

---

## Collection

A directory marked as a collection by the presence of `_collection.yml`:

```
blog/
  _collection.yml      ← marker; may contain `itemModel: blog-post`
  _order.yml           ← ordering of items
  post-one/
    _index.yml
  post-two/
    _index.yml
```

Collections are listed via `GET /sites/:site/collection?path=blog`.  
Items are individual pages within the collection directory.

---

## Ordering

`_order.yml` defines sibling order at any directory level:

```yaml
order:
  - home
  - about
  - blog
  - contact
```

`buildTree` in `lib/content.ts` uses this to sort children. `PUT /sites/:site/collection/order` rewrites `_order.yml` for a given collection.

---

## File Format Priority

When reading a page, the API tries files in this order:
1. `_index.yml`
2. `_index.json`
3. `{pageName}.json`
4. `{pageName}.yml`

When writing, it always uses `_index.yml`.

---

## Content Tree

`GET /sites/:site/tree` returns the full recursive tree:

```json
{
  "name": "root",
  "children": [
    {
      "name": "home",
      "path": "home",
      "isCollection": false,
      "children": []
    },
    {
      "name": "blog",
      "path": "blog",
      "isCollection": true,
      "children": [
        { "name": "post-one", "path": "blog/post-one", "isCollection": false, "children": [] }
      ]
    }
  ]
}
```

---

## SEO Fields

Standard SEO object stored in `_index.yml`:

```yaml
seo:
  meta_title: "Page Title | Site Name"
  meta_description: "Description for search engines"
  og_image: "og-image.webp"
  keywords: "keyword1, keyword2"
  robots: "index, follow"
  canonical: "https://example.com/page"
  schema_type: "WebPage"
```

---

## Global Data

`_global/` files store site-wide data not tied to any page:

```
_global/
  navigation.json    → menus, nav links
  footer.yml         → footer columns, social links
  social.json        → social media handles
```

These are edited via `GET/PUT /sites/:site/global`.

---

## Serialization

`lib/content.ts` handles all parse/serialize:

```typescript
parseContent(content: string, ext: "yml"|"yaml"|"json"|"md") → object
serializeContent(data: object, ext: "yml"|"json") → string
```

- YAML: `js-yaml` (parse + dump)
- JSON: `JSON.parse` / `JSON.stringify` with 2-space indent
- Markdown: `gray-matter` to extract frontmatter + body

---

## File Locking

All writes go through `withFileLock(path, fn)` — an in-process async mutex. This prevents concurrent writes from corrupting files when two API requests modify the same resource simultaneously.

```typescript
return withFileLock(filePath, async () => {
  await writeFile(filePath, serialized)
})
```
