# Media Management

## Overview

Media files (images, documents, etc.) are stored inside the version directory under `media/`. The API provides upload, serve, list, rename, move, copy, and delete operations.

---

## Storage Location

```
storage/{site}/{version}/media/
  hero.webp
  team/
    alice.webp
    bob.webp
  documents/
    brochure.pdf
```

Media is versioned — each content version has its own `media/` folder.

---

## Upload

```
POST /sites/:site/media/upload
Content-Type: multipart/form-data

file: <File>
path: "team"        ← optional subfolder (default: "media")
```

**Processing pipeline** (images only — PNG, JPG, JPEG, WebP, GIF, AVIF):
1. Receives file via multipart form
2. If the file is a raster image (not SVG/GIF), runs through **sharp**:
   - `rotate()` — auto-rotates based on EXIF orientation
   - `resize({ width: 1800, height: 1200, fit: 'inside', withoutEnlargement: true })`
   - Converts to **WebP** at quality 82
3. Saves to `{version}/media/{path}/{filename}.webp`
4. Returns the saved path

Non-image files are saved as-is without processing.

---

## Serve

```
GET /sites/:site/media/serve?path=team/alice.webp
```

Returns the raw file with appropriate `Content-Type`. Used by both the CMS UI (previews) and the public site (`/api/media?path=...`).

---

## List

```
GET /sites/:site/media?path=team
```

Returns files and subdirectories at the given path (relative to `media/`):

```json
{
  "files": [
    { "name": "alice.webp", "path": "team/alice.webp", "size": 24300, "isDir": false },
    { "name": "bob.webp",   "path": "team/bob.webp",   "size": 18500, "isDir": false }
  ],
  "dirs": []
}
```

---

## Rename

```
PUT /sites/:site/media/rename
{ "path": "team/alice.webp", "name": "alice-smith.webp" }
```

Renames the file within its current directory.

---

## Move

```
PUT /sites/:site/media/move
{ "path": "team/alice.webp", "dest": "people/alice.webp" }
```

Moves to a new path (relative to `media/`). Creates destination directory if needed.

---

## Copy

```
PUT /sites/:site/media/copy
{ "path": "hero.webp", "dest": "archive/hero-backup.webp" }
```

Copies file to destination path.

---

## Delete

```
DELETE /sites/:site/media?path=team/alice.webp
```

Permanently deletes the file.

---

## Media Picker — `MediaPicker.vue`

Inline popover used inside `PropField` (type `image` or `media-array`):
- Navigates folders
- Shows thumbnail previews
- Single or multi-select
- Emits selected path(s) relative to `media/`

## Media Panel — `MediaPanel.vue`

Full-page panel version of the media browser used in `media.vue`:
- Upload via drag-drop or file picker
- Rename, move, copy, delete files
- Create subfolders

---

## Path References in Content

Media paths in YAML/JSON are stored **relative** (no leading slash, no version prefix):

```yaml
props:
  image: "team/alice.webp"
```

The site renderer resolves them via `/api/media?path=team/alice.webp`.

---

## Image Optimization Notes

- Upload auto-converts to WebP (max 1800×1200, quality 82)
- For bulk conversion of existing images, use the `convert-*.ts` scripts (Bun + sharp)
- `__MACOSX/._*` resource fork files from macOS ZIPs are harmless and ignored
- Sharp requires `linux-x64` bindings on the server — must run from the `cms/api/` directory so Bun uses the project's own `node_modules/sharp` (not the global cache)
