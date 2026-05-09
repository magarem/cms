import { readFile, writeFile, readdir, mkdir, rm, stat, rename as renameFile, copyFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, extname, basename, dirname } from "node:path"
import yaml from "js-yaml"
import matter from "gray-matter"

export const SITES_ROOT =
  process.env.SIRIUS_STORAGE_ROOT ??
  join(import.meta.dir, "..", "..", "..", "storage")

export async function parseContent(content: string, ext: string): Promise<any> {
  if (ext === ".json") return JSON.parse(content)
  if (ext === ".yml" || ext === ".yaml") return yaml.load(content) || {}
  if (ext === ".md") {
    const parse = typeof matter === "function" ? matter : (matter as any).default
    const { data, content: body } = parse(content)
    return { ...data, _markdown: body }
  }
  return {}
}

export function serializeContent(data: any, ext: string): string {
  if (ext === ".json") return JSON.stringify(data, null, 2)
  if (ext === ".yml" || ext === ".yaml") return yaml.dump(data, { indent: 2, lineWidth: -1 })
  return String(data)
}

export async function getSiteSettings(site: string) {
  const path = join(SITES_ROOT, site, "_settings.json")
  if (!existsSync(path)) return { activeEditionVersion: "v1", siteVersions: ["v1"], defaultSiteVersion: "v1" }
  return JSON.parse(await readFile(path, "utf-8"))
}

export async function saveSiteSettings(site: string, settings: any) {
  const path = join(SITES_ROOT, site, "_settings.json")
  await writeFile(path, JSON.stringify(settings, null, 2))
}

export function getActiveVersion(settings: any): string {
  if (settings.activeEditionVersion) return settings.activeEditionVersion
  // Legacy fallback for old activeVersions array format
  const v = settings.activeVersions || ["v1"]
  return Array.isArray(v) ? v[v.length - 1] : v
}

export async function resolvePageFile(
  site: string,
  version: string,
  pagePath: string
): Promise<{ filePath: string; ext: string; content: string; data: any } | null> {
  const dataDir = join(SITES_ROOT, site, version)
  const clean = pagePath.replace(/^\/+|\/+$/g, "")

  const candidates = [
    { filePath: join(dataDir, `${clean}.json`), ext: ".json" },
    { filePath: join(dataDir, `${clean}.yml`), ext: ".yml" },
    { filePath: join(dataDir, clean, "_index.json"), ext: ".json" },
    { filePath: join(dataDir, clean, "_index.yml"), ext: ".yml" },
  ]

  for (const c of candidates) {
    if (existsSync(c.filePath)) {
      const content = await readFile(c.filePath, "utf-8")
      return { ...c, content, data: await parseContent(content, c.ext) }
    }
  }
  return null
}

export async function writePage(
  site: string,
  version: string,
  pagePath: string,
  data: any
): Promise<void> {
  const dataDir = join(SITES_ROOT, site, version)
  const clean = pagePath.replace(/^\/+|\/+$/g, "")

  const existing = await resolvePageFile(site, version, clean)
  let targetPath: string
  let ext: string

  if (existing) {
    targetPath = existing.filePath
    ext = existing.ext
  } else {
    targetPath = join(dataDir, clean, "_index.yml")
    ext = ".yml"
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, serializeContent(data, ext))
}

export async function deletePage(site: string, version: string, pagePath: string): Promise<void> {
  const existing = await resolvePageFile(site, version, pagePath)
  if (existing) await rm(existing.filePath)
}

export async function buildTree(site: string, version: string, currentPath = ""): Promise<any[]> {
  const dataDir = join(SITES_ROOT, site, version)
  const dirPath = currentPath ? join(dataDir, currentPath) : dataDir

  if (!existsSync(dirPath)) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const items: any[] = []

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue

    const fullSlug = currentPath ? `${currentPath}/${entry.name}` : entry.name

    if (!entry.isDirectory()) continue

    let meta: any = {}
    let dirType: "page" | "collection" | "folder" = "folder"

    // Detect collection by _collection.yml marker, then read title from _index.yml
    for (const col of ["_collection.yml", "_collection.json"]) {
      const colPath = join(dirPath, entry.name, col)
      if (existsSync(colPath)) {
        dirType = "collection"
        break
      }
    }

    // For both collections and pages, title comes from _index.yml
    for (const idx of ["_index.yml", "_index.json"]) {
      const idxPath = join(dirPath, entry.name, idx)
      if (existsSync(idxPath)) {
        const raw = await readFile(idxPath, "utf-8")
        meta = await parseContent(raw, extname(idx))
        if (dirType === "folder") dirType = "page"
        break
      }
    }

    items.push({
      title: meta.title || entry.name,
      name: entry.name,
      slug: fullSlug,
      type: dirType,
      children: dirType === "collection" ? [] : await buildTree(site, version, fullSlug),
    })
  }

  // Honor _order.yml so drag-reorder in the sidebar persists across refresh
  let order: string[] = []
  for (const f of ["_order.yml", "_order.json"]) {
    const orderFile = join(dirPath, f)
    if (existsSync(orderFile)) {
      const raw = await readFile(orderFile, "utf-8")
      const meta = await parseContent(raw, extname(f))
      order = Array.isArray(meta.order) ? meta.order : []
      break
    }
  }
  if (order.length) {
    items.sort((a: any, b: any) => {
      const ai = order.indexOf(a.name)
      const bi = order.indexOf(b.name)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }

  return items
}

export async function listCollectionItems(
  site: string,
  version: string,
  collectionPath: string
): Promise<any[]> {
  const dirPath = join(SITES_ROOT, site, version, collectionPath.replace(/^\/+/, ""))
  if (!existsSync(dirPath)) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const items: any[] = []

  // Prepend the collection's own _index as a "cover" item if it exists
  for (const idx of ["_index.yml", "_index.json"]) {
    const coverPath = join(dirPath, idx)
    if (existsSync(coverPath)) {
      const raw = await readFile(coverPath, "utf-8")
      const meta = await parseContent(raw, extname(idx))
      items.push({
        slug: collectionPath,
        name: "_index",
        title: meta.title || null,
        date: null,
        isCover: true,
      })
      break
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue
    let meta: any = {}
    let createdAt: string | null = null
    let updatedAt: string | null = null
    for (const idx of ["_index.yml", "_index.json"]) {
      const idxPath = join(dirPath, entry.name, idx)
      if (existsSync(idxPath)) {
        const raw = await readFile(idxPath, "utf-8")
        meta = await parseContent(raw, extname(idx))
        const s = await stat(idxPath)
        createdAt = s.birthtime.toISOString()
        updatedAt = s.mtime.toISOString()
        break
      }
    }
    items.push({
      slug: `${collectionPath}/${entry.name}`,
      name: entry.name,
      title: meta.title || entry.name,
      date: meta.date || null,
      status: meta.status || null,
      createdAt,
      updatedAt,
    })
  }

  // Apply custom order from _order.yml (same file the site renderer uses)
  let order: string[] = []
  for (const f of ["_order.yml", "_order.json"]) {
    const orderFile = join(dirPath, f)
    if (existsSync(orderFile)) {
      const raw = await readFile(orderFile, "utf-8")
      const meta = await parseContent(raw, extname(f))
      order = Array.isArray(meta.order) ? meta.order : []
      break
    }
  }
  if (order.length) {
    items.sort((a: any, b: any) => {
      if (a.isCover) return -1
      if (b.isCover) return 1
      const ai = order.indexOf(a.name)
      const bi = order.indexOf(b.name)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }

  return items
}

export async function saveCollectionOrder(
  site: string,
  version: string,
  collectionPath: string,
  order: string[]
): Promise<void> {
  const dirPath = join(SITES_ROOT, site, version, collectionPath.replace(/^\/+/, ""))
  await mkdir(dirPath, { recursive: true })
  await writeFile(join(dirPath, "_order.yml"), serializeContent({ order }, ".yml"), "utf-8")
}

// Insert/move `movedName` before or after `referenceName` in folder's _order.yml.
// Seeds from filesystem listing if no _order.yml exists yet, so existing siblings
// keep their relative order on first reorder.
export async function applyOrderInFolder(
  site: string,
  version: string,
  folderPath: string,
  movedName: string,
  referenceName: string,
  position: "before" | "after"
): Promise<void> {
  const cleanPath = folderPath.replace(/^\/+|\/+$/g, "")
  const dirPath = join(SITES_ROOT, site, version, cleanPath)
  if (!existsSync(dirPath)) return

  let order: string[] = []
  for (const f of ["_order.yml", "_order.json"]) {
    const orderFile = join(dirPath, f)
    if (existsSync(orderFile)) {
      const raw = await readFile(orderFile, "utf-8")
      const meta = await parseContent(raw, extname(f))
      order = Array.isArray(meta.order) ? meta.order : []
      break
    }
  }

  if (order.length === 0) {
    const entries = await readdir(dirPath, { withFileTypes: true })
    order = entries
      .filter(e => !e.name.startsWith("_") && !e.name.startsWith(".") && e.isDirectory())
      .map(e => e.name)
  }

  if (!order.includes(movedName)) order.push(movedName)

  const filtered = order.filter(n => n !== movedName)
  const refIdx = filtered.indexOf(referenceName)
  if (refIdx >= 0) {
    const insertAt = position === "before" ? refIdx : refIdx + 1
    filtered.splice(insertAt, 0, movedName)
  } else {
    filtered.push(movedName)
  }

  await saveCollectionOrder(site, version, cleanPath, filtered)
}

export async function deleteCollectionItem(
  site: string,
  version: string,
  itemPath: string
): Promise<void> {
  const dirPath = join(SITES_ROOT, site, version, itemPath.replace(/^\/+/, ""))
  if (existsSync(dirPath)) await rm(dirPath, { recursive: true, force: true })
}

const MEDIA_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif",
  ".mp4", ".webm", ".mov",
  ".mp3", ".wav", ".ogg", ".flac",
  ".pdf",
])
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"])
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"])
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".flac"])

export async function listMedia(site: string, version: string, path: string): Promise<any[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "")
  const dirPath = join(SITES_ROOT, site, version, cleanPath)
  if (!existsSync(dirPath)) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const items: any[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const entryPath = cleanPath ? `${cleanPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      items.push({ type: "folder", name: entry.name, path: entryPath })
    } else {
      const ext = extname(entry.name).toLowerCase()
      if (!MEDIA_EXTS.has(ext)) continue
      const fileStat = await stat(join(dirPath, entry.name))
      items.push({
        type: "file",
        name: entry.name,
        path: entryPath,
        size: fileStat.size,
        ext,
        isImage: IMAGE_EXTS.has(ext),
        isVideo: VIDEO_EXTS.has(ext),
        isAudio: AUDIO_EXTS.has(ext),
      })
    }
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return items
}

export async function deleteMedia(site: string, version: string, filePath: string): Promise<void> {
  const full = join(SITES_ROOT, site, version, filePath.replace(/^\/+/, ""))
  if (existsSync(full)) await rm(full, { recursive: true, force: true })
}

export async function renameMedia(site: string, version: string, filePath: string, newName: string): Promise<void> {
  const full = join(SITES_ROOT, site, version, filePath.replace(/^\/+/, ""))
  const dest = join(dirname(full), newName)
  if (existsSync(full)) await renameFile(full, dest)
}

export async function moveMedia(site: string, version: string, srcPath: string, destDir: string): Promise<void> {
  const src = join(SITES_ROOT, site, version, srcPath.replace(/^\/+/, ""))
  const dest = join(SITES_ROOT, site, version, destDir.replace(/^\/+/, ""), basename(srcPath))
  if (existsSync(src)) {
    await mkdir(dirname(dest), { recursive: true })
    await renameFile(src, dest)
  }
}

export async function copyMedia(site: string, version: string, srcPath: string): Promise<void> {
  const src = join(SITES_ROOT, site, version, srcPath.replace(/^\/+/, ""))
  if (!existsSync(src)) return
  const ext = extname(src)
  const base = basename(src, ext)
  let dest = join(dirname(src), `${base}_copy${ext}`)
  let n = 2
  while (existsSync(dest)) dest = join(dirname(src), `${base}_copy${n++}${ext}`)
  await copyFile(src, dest)
}
