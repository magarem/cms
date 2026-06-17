# Revision History

## Overview

Every time a page is saved (`PUT /sites/:site/page`), the previous version is automatically snapshotted. Up to **20 revisions** are kept per page. Any revision can be previewed and restored.

---

## Storage

Revisions are stored inside the page directory, under `_revisions/`:

```
storage/{site}/{version}/about/
  _index.yml            ← current content
  _revisions/
    rev-1718000000000.json
    rev-1718001000000.json
    rev-1718002000000.json   ← most recent
```

Each file is a JSON object:

```json
{
  "id": "rev-1718002000000",
  "savedAt": "2026-06-11T14:30:00.000Z",
  "savedBy": "admin",
  "size": 2048,
  "data": {
    "title": "About Us",
    "blocks": [...]
  }
}
```

The `_revisions/` directory starts with `_` so it is **automatically skipped** by `buildTree` (same rule as `_global`, `_backups`, etc.) and never appears in the CMS sidebar.

---

## Pruning

After each save, if there are more than 20 revision files in `_revisions/`, the oldest ones are deleted. Files are sorted by filename (which contains the timestamp) so the oldest are first.

---

## API Endpoints

### List revisions
```
GET /sites/:site/page/revisions?path=about
→ { revisions: RevisionMeta[] }   ← newest first
```

Returns metadata only (no `data` field) — lightweight for listing.

### Get revision detail
```
GET /sites/:site/page/revisions/:revId?path=about
→ { revision: Revision }   ← includes full data
```

### Restore revision
```
POST /sites/:site/page/revisions/:revId/restore?path=about
```

- Requires editor or admin role
- Before restoring, **saves the current content as a new revision** (so the restore is itself undoable)
- Writes the revision's `data` as the new `_index.yml`

---

## Save Flow

```
Editor hits "Salvar"
  → PUT /sites/:site/page?path=about
    → resolvePageFile() reads current _index.yml
    → saveRevision() writes _revisions/rev-{now}.json
    → writePage() writes new _index.yml
```

---

## Restore Flow

```
User opens Histórico → picks a revision → clicks "Restaurar"
  → POST /sites/:site/page/revisions/:id/restore?path=about
    → getRevision() loads revision data
    → saveRevision() snapshots current content (so restore is undoable)
    → writePage() writes revision data as new _index.yml
  → UI refreshes page (form reloads from API)
```

---

## UI — Histórico Button

Located in the page editor topbar (`[...slug].vue`), between "Excluir" / "Raw" buttons.

**Slideover panel** (opens from the right):
- Shows all revisions, newest first
- Each card: timestamp, username, file size
- **Eye icon** → toggles an inline preview (title + block list from that revision)
- **Restaurar button** → restores that revision; UI closes and reloads

---

## `lib/content.ts` Exports

| Function | Signature | Purpose |
|----------|-----------|---------|
| `saveRevision` | `(site, version, path, data, savedBy)` | Write a revision snapshot |
| `listRevisions` | `(site, version, path)` → `RevisionMeta[]` | List revisions (newest first, no data) |
| `getRevision` | `(site, version, path, id)` → `Revision \| null` | Load one revision with full data |

---

## RevisionMeta Interface

```typescript
interface RevisionMeta {
  id: string       // "rev-{timestamp}"
  savedAt: string  // ISO 8601
  savedBy: string  // username
  size: number     // JSON byte size of data
}

interface Revision extends RevisionMeta {
  data: Record<string, any>  // full page data at snapshot time
}
```

---

## Notes

- Revisions are versioned — they live inside the active edition version directory, not at the site root
- Restoring a revision does **not** affect `content.md` — markdown body is not snapshotted (planned for a future update)
- The `rev.id` is sanitized server-side (`/[^a-z0-9-]/gi`) to prevent path traversal
