# Collections

## Overview

A **collection** is a directory that contains repeatable content items — blog posts, team members, products, etc. It is marked by the presence of a `_collection.yml` file inside the directory.

---

## Directory Structure

```
storage/{site}/{version}/
  blog/
    _collection.yml      ← marks this as a collection
    _order.yml           ← ordering of items
    post-one/
      _index.yml
    post-two/
      _index.yml
      content.md
```

---

## `_collection.yml`

Usually empty `{}` or contains a model reference:

```yaml
itemModel: blog-post
```

`itemModel` tells the editor which **model** to use when creating new items in this collection (pre-fills block templates and fields).

---

## Collection vs Page

| Aspect | Page | Collection item |
|--------|------|----------------|
| Has children | Yes (sub-pages) | No |
| Listed by `/collection` endpoint | No | Yes |
| Listed in tree | Yes | Yes (as children of collection) |
| Has `_collection.yml` | No | Parent has it |

---

## API Endpoints

### List items
```
GET /sites/:site/collection?path=blog
```
Returns items sorted by `_order.yml`. Each item includes its frontmatter (title, etc.) and path.

### Create item
```
POST /sites/:site/collection
{ "path": "blog", "name": "new-post", "model": "blog-post" }
```
- Creates `blog/new-post/_index.yml` with default blocks from the model
- Creates `content.md` if model includes a `ContentMD` block
- Adds `new-post` to `blog/_order.yml`

### Delete item
```
DELETE /sites/:site/collection?path=blog/new-post
```
Admin only. Removes the directory and updates `_order.yml`.

### Reorder items
```
PUT /sites/:site/collection/order
{ "path": "blog", "order": ["post-two", "post-one"] }
```
Rewrites `_order.yml` for the given collection path.

---

## UI — `collections/[...slug].vue`

Shows:
1. **Item list** with drag-to-reorder (updates order via `PUT /collection/order`)
2. **Add item** button (dialog to enter slug/name → `POST /collection`)
3. Clicking an item navigates to its page editor

---

## Item Editor

Collection items are edited through the same page editor as regular pages (`pages/[...slug].vue`). The route resolves the slug and loads the item's `_index.yml`.

---

## Ordering

`_order.yml` is the source of truth for item order:
```yaml
order:
  - post-two
  - post-one
  - post-three
```

`listCollectionItems` in `lib/content.ts` reads this file and sorts items accordingly. Items not listed in `_order.yml` are appended at the end.

---

## Tree Detection

`buildTree` in `lib/content.ts` detects collections by checking if `_collection.yml` exists in a directory. The tree node gets `isCollection: true`.

The `PageTreeSidebar` shows a different icon for collections and enables collection-specific context menu actions (add item, etc.).
