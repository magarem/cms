# Backups

## Overview

The backup system lets admins create point-in-time snapshots of site content, restore from any snapshot, download as ZIP, or upload a ZIP as a new backup entry.

---

## Storage

```
storage/{site}/_backups/
  _manifest.json           ← index of all backups
  backup-{timestamp}/      ← individual snapshot directory
    production/            ← copy of version dir
    v1/
    _analytics/
    _settings.json         ← always included
```

`_manifest.json` is an array of `BackupEntry` objects.

---

## BackupEntry Schema

```typescript
interface BackupEntry {
  id: string         // "backup-{Date.now()}"
  label: string      // user-provided description
  createdAt: string  // ISO 8601
  size: number       // total bytes of snapshot directory
  dirs: string[]     // which dirs were included
}
```

---

## API Endpoints

### List available dirs (for backup selection)
```
GET /sites/:site/versions
→ { versions: ["production","v1"], dataDirs: ["_analytics","_newsletter"] }
```
Returns version dirs and data dirs, excluding `_backups`, hidden dirs, and legacy backup dirs.

### List backups
```
GET /sites/:site/backups
→ { success: true, backups: BackupEntry[] }   ← newest first
```

### Create backup
```
POST /sites/:site/backups
{ "label": "Before redesign", "dirs": ["production", "v1"] }
```
- Admin only
- Copies selected dirs into `_backups/backup-{timestamp}/`
- Always includes `_settings.json`
- Records size, dirs, timestamp in manifest

### Upload ZIP as backup
```
POST /sites/:site/backups/upload
Content-Type: multipart/form-data
file: <zip file>
```
- Admin only
- Extracts ZIP to temp dir, unwraps single-folder wrapper if present
- Removes macOS `__MACOSX` metadata dirs
- Registers as a new `BackupEntry` using the filename as label

### Download backup as ZIP
```
GET /sites/:site/backups/:id/download
→ application/zip (attachment)
```
- Zips the snapshot directory using system `zip` command
- Caches the ZIP in `/tmp/sirius-backup-{site}-{id}.zip`
- Filename: `{label}-{id}.zip`

### Delete backup
```
DELETE /sites/:site/backups/:id
```
- Admin only
- Removes snapshot directory and cached ZIP
- Updates manifest

### Restore backup
```
POST /sites/:site/backups/:id/restore
```
- Admin only
- Copies each dir from snapshot back to site root (overwrites)
- Restores `_settings.json` if present in snapshot

---

## Create Flow

```
1. Admin clicks "Criar backup"
2. UI fetches GET /versions → lists available dirs
3. Admin optionally selects/deselects dirs and sets a label
4. POST /backups → server copies dirs, records entry in manifest
5. UI refreshes list
```

---

## Restore Flow

```
1. Admin clicks "Restaurar" on a backup card
2. Confirmation modal shown (warns about overwriting current content)
3. POST /backups/:id/restore → server copies snapshot dirs back to site root
4. Toast: "Conteúdo restaurado com sucesso."
```

---

## ZIP Upload Flow

```
1. Admin clicks "Importar ZIP"
2. Selects a .zip file
3. POST /backups/upload (multipart)
4. Server extracts ZIP, unwraps wrapper dir, cleans OS metadata
5. Registers as backup entry with filename as label
6. UI refreshes list — backup is immediately available for restore
```

---

## Legacy Backup Dirs

Old backup system (pre-backups.ts) created directories at the **top level** of the site with names like:
- `um2-backup-1780488851593`
- `segundo-backup-1780490607687`

These match `/backup-\d{10,}/` and are **filtered out** by `isLegacyBackupDir()` in both `sites.ts` and `backups.ts` to prevent them from appearing in the version list or backup dir picker.

---

## UI — `backups.vue`

States:
- **Loading**: spinner while fetching manifest
- **Error**: red error block with message (e.g. on 401) + "Tentar novamente" button
- **Empty**: archive icon + hint to create first backup
- **List**: one card per backup with download, restore, delete actions

Modals:
- **Criar backup**: label input + dir selector (checkboxes per version/data dir)
- **Restaurar**: warning + confirmation button
- **Importar ZIP**: file input + import button
- **Eliminar**: confirmation dialog

---

## File Locking

`_manifest.json` writes use `withFileLock()` to prevent concurrent corruption when two backup operations run simultaneously.
