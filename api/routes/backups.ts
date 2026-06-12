import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readdir, writeFile, mkdir, rm, readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { SITES_ROOT, withFileLock } from "../lib/content"
import { JWT_SECRET } from "../lib/config"

async function getUser(jwt: any, token: string | undefined, expectedSite?: string) {
  if (!token) return null
  const user = await jwt.verify(token) as any
  if (!user) return null
  if (expectedSite && user.site !== expectedSite) return null
  return user
}

const BACKUPS_DIR = (site: string) => join(SITES_ROOT, site, "_backups")
const MANIFEST    = (site: string) => join(BACKUPS_DIR(site), "_manifest.json")

interface BackupEntry {
  id: string
  label: string
  createdAt: string
  size: number
  dirs: string[]
}

async function readManifest(site: string): Promise<BackupEntry[]> {
  const path = MANIFEST(site)
  if (!existsSync(path)) return []
  return JSON.parse(await readFile(path, "utf-8"))
}

async function writeManifest(site: string, entries: BackupEntry[]): Promise<void> {
  const path = MANIFEST(site)
  await mkdir(BACKUPS_DIR(site), { recursive: true })
  return withFileLock(path, () => writeFile(path, JSON.stringify(entries, null, 2)))
}

async function dirSize(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) return 0
  let total = 0
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dirPath, e.name)
    if (e.isDirectory()) total += await dirSize(full)
    else { const s = await stat(full); total += s.size }
  }
  return total
}

function isLegacyBackupDir(name: string): boolean {
  return /backup-\d{10,}/.test(name)
}

async function listAllStorageDirs(site: string): Promise<{ versions: string[], dataDirs: string[] }> {
  const siteDir = join(SITES_ROOT, site)
  if (!existsSync(siteDir)) return { versions: [], dataDirs: [] }
  const entries = await readdir(siteDir, { withFileTypes: true })
  const versions: string[] = []
  const dataDirs: string[] = []
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "_backups" || e.name.startsWith(".") || isLegacyBackupDir(e.name)) continue
    if (e.name.startsWith("_")) dataDirs.push(e.name)
    else versions.push(e.name)
  }
  return { versions, dataDirs }
}

async function zipDirectory(srcDir: string, destZip: string): Promise<void> {
  const proc = Bun.spawn(["zip", "-r", destZip, "."], {
    cwd: srcDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  if (code !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(`zip failed (${code}): ${err}`)
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  const proc = Bun.spawn(["unzip", "-o", zipPath, "-d", destDir], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  if (code !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(`unzip failed (${code}): ${err}`)
  }
}

const OS_METADATA_DIRS = new Set(["__MACOSX", "__pycache__"])

async function listTopLevelDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith(".") && !OS_METADATA_DIRS.has(e.name))
    .map(e => e.name)
}

export const backupsRoutes = new Elysia({ prefix: "/sites" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // ── List available storage dirs ───────────────────────────
  .get("/:site/versions", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const { versions, dataDirs } = await listAllStorageDirs(params.site)
    return { success: true, versions, dataDirs }
  })

  // ── List backups ──────────────────────────────────────────
  .get("/:site/backups", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const backups = await readManifest(params.site)
    return { success: true, backups: backups.slice().reverse() }
  })

  // ── Create backup ─────────────────────────────────────────
  .post("/:site/backups", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas administradores podem criar backups." } }

    const { versions, dataDirs } = await listAllStorageDirs(params.site)
    const allDirs = [...versions, ...dataDirs]
    const requested = (body as any)?.dirs as string[] | undefined
    const dirs = (requested && requested.length > 0) ? allDirs.filter(d => requested.includes(d)) : allDirs
    if (!dirs.length) { set.status = 400; return { error: "Nenhuma pasta válida selecionada." } }

    const id      = `backup-${Date.now()}`
    const destDir = join(BACKUPS_DIR(params.site), id)
    const siteDir = join(SITES_ROOT, params.site)

    await mkdir(destDir, { recursive: true })
    for (const d of dirs) {
      await Bun.spawn(["cp", "-r", join(siteDir, d), join(destDir, d)], { stdout: "pipe", stderr: "pipe" }).exited
    }

    // always include _settings.json
    const settingsPath = join(siteDir, "_settings.json")
    if (existsSync(settingsPath)) {
      await Bun.write(join(destDir, "_settings.json"), Bun.file(settingsPath))
    }

    const size  = await dirSize(destDir)
    const entry: BackupEntry = {
      id,
      label:     (body as any)?.label?.trim() || "",
      createdAt: new Date().toISOString(),
      size,
      dirs,
    }

    const manifest = await readManifest(params.site)
    manifest.push(entry)
    await writeManifest(params.site, manifest)

    return { success: true, backup: entry }
  }, {
    body: t.Object({
      label: t.Optional(t.String()),
      dirs:  t.Optional(t.Array(t.String())),
    }),
  })

  // ── Upload zip → registers as backup entry ────────────────
  .post("/:site/backups/upload", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Sem permissão." } }

    const file = (body as any).file as File
    if (!file || !file.name.endsWith(".zip")) {
      set.status = 400; return { error: "Ficheiro ZIP inválido." }
    }

    const id      = `backup-${Date.now()}`
    const destDir = join(BACKUPS_DIR(params.site), id)
    const tmpZip  = join("/tmp", `sirius-upload-${randomUUID()}.zip`)

    await mkdir(destDir, { recursive: true })
    await Bun.write(tmpZip, await file.arrayBuffer())
    await extractZip(tmpZip, destDir)
    await rm(tmpZip, { force: true })

    // Remove OS metadata dirs (e.g. __MACOSX from macOS zip) before checking structure
    for (const metaDir of OS_METADATA_DIRS) {
      const metaPath = join(destDir, metaDir)
      if (existsSync(metaPath)) await rm(metaPath, { recursive: true, force: true })
    }

    // Unwrap single-folder wrapper (e.g. zip created from a folder on macOS/Windows)
    const topLevel = await listTopLevelDirs(destDir)
    if (topLevel.length === 1) {
      const wrapperDir = join(destDir, topLevel[0])
      const inner = await readdir(wrapperDir, { withFileTypes: true })
      if (inner.length > 0) {
        for (const e of inner) {
          await Bun.spawn(["mv", join(wrapperDir, e.name), join(destDir, e.name)], { stdout: "pipe", stderr: "pipe" }).exited
        }
        await rm(wrapperDir, { recursive: true, force: true })
        // Clean up any __MACOSX that was nested inside the wrapper
        for (const metaDir of OS_METADATA_DIRS) {
          const metaPath = join(destDir, metaDir)
          if (existsSync(metaPath)) await rm(metaPath, { recursive: true, force: true })
        }
      }
    }

    const dirs = await listTopLevelDirs(destDir)
    if (!dirs.length) {
      await rm(destDir, { recursive: true, force: true })
      set.status = 400; return { error: "ZIP não contém pastas reconhecidas." }
    }

    const size  = await dirSize(destDir)
    const label = file.name.replace(/\.zip$/i, "")
    const entry: BackupEntry = {
      id,
      label,
      createdAt: new Date().toISOString(),
      size,
      dirs,
    }

    const manifest = await readManifest(params.site)
    manifest.push(entry)
    await writeManifest(params.site, manifest)

    return { success: true, backup: entry }
  }, {
    body: t.Object({ file: t.File() }),
  })

  // ── Download backup as zip ────────────────────────────────
  .get("/:site/backups/:id/download", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const manifest = await readManifest(params.site)
    const entry    = manifest.find(b => b.id === params.id)
    if (!entry) { set.status = 404; return { error: "Backup não encontrado." } }

    const srcDir  = join(BACKUPS_DIR(params.site), params.id)
    if (!existsSync(srcDir)) { set.status = 404; return { error: "Ficheiros do backup não encontrados." } }

    const zipPath = join("/tmp", `sirius-backup-${params.site}-${params.id}.zip`)
    if (!existsSync(zipPath)) {
      await zipDirectory(srcDir, zipPath)
    }

    const label   = entry.label ? entry.label.replace(/[^a-z0-9]/gi, "-").toLowerCase() : "backup"
    const filename = `${label}-${params.id}.zip`

    return new Response(Bun.file(zipPath), {
      headers: {
        "Content-Type":        "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  })

  // ── Delete backup ─────────────────────────────────────────
  .delete("/:site/backups/:id", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Sem permissão." } }

    const manifest = await readManifest(params.site)
    const idx      = manifest.findIndex(b => b.id === params.id)
    if (idx === -1) { set.status = 404; return { error: "Backup não encontrado." } }

    const destDir = join(BACKUPS_DIR(params.site), params.id)
    if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true })

    // remove cached zip if exists
    const zipPath = join("/tmp", `sirius-backup-${params.site}-${params.id}.zip`)
    if (existsSync(zipPath)) await rm(zipPath, { force: true })

    manifest.splice(idx, 1)
    await writeManifest(params.site, manifest)

    return { success: true }
  })

  // ── Restore from existing backup ──────────────────────────
  .post("/:site/backups/:id/restore", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Sem permissão." } }

    const manifest = await readManifest(params.site)
    const entry    = manifest.find(b => b.id === params.id)
    if (!entry) { set.status = 404; return { error: "Backup não encontrado." } }

    const srcDir  = join(BACKUPS_DIR(params.site), params.id)
    if (!existsSync(srcDir)) { set.status = 404; return { error: "Ficheiros do backup não encontrados." } }

    const siteDir = join(SITES_ROOT, params.site)

    // Restore only the dirs recorded in the manifest (avoids copying wrappers or OS junk)
    for (const dirName of entry.dirs) {
      const src  = join(srcDir, dirName)
      const dest = join(siteDir, dirName)
      if (!existsSync(src)) continue
      const s = await stat(src)
      if (s.isDirectory()) {
        if (existsSync(dest)) await rm(dest, { recursive: true, force: true })
        await Bun.spawn(["cp", "-r", src, dest], { stdout: "pipe", stderr: "pipe" }).exited
      } else {
        await Bun.write(dest, Bun.file(src))
      }
    }

    // Always restore _settings.json if present in backup
    const settingsSrc = join(srcDir, "_settings.json")
    if (existsSync(settingsSrc)) {
      await Bun.write(join(siteDir, "_settings.json"), Bun.file(settingsSrc))
    }

    return { success: true, restoredFrom: entry }
  })
