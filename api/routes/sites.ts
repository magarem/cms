import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readdir, writeFile, mkdir, rm, readFile, rename as renameNode, cp, appendFile } from "node:fs/promises"
import { existsSync, createReadStream } from "node:fs"
import { join, extname, dirname, basename } from "node:path"
import { createInterface } from "node:readline"
import { createHash } from "node:crypto"
import {
  SITES_ROOT,
  getSiteSettings,
  saveSiteSettings,
  getActiveVersion,
  resolvePageFile,
  writePage,
  deletePage,
  buildTree,
  listMedia,
  listCollectionItems,
  deleteCollectionItem,
  saveCollectionOrder,
  applyOrderInFolder,
  deleteMedia,
  renameMedia,
  moveMedia,
  copyMedia,
  parseContent,
  serializeContent,
} from "../lib/content"

const JWT_SECRET = process.env.JWT_SECRET || "sirius_cms_dev_secret_change_in_production"

async function getUser(jwt: any, token: string | undefined) {
  if (!token) return null
  return await jwt.verify(token)
}

export const sitesRoutes = new Elysia({ prefix: "/sites" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // ── List all sites ──────────────────────────────────────────
  .get("/", async ({ cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const items = await readdir(SITES_ROOT, { withFileTypes: true })
    const sites = items
      .filter((i) => i.isDirectory() && !i.name.startsWith("."))
      .filter((i) => {
        if ((user as any).sites?.includes("*")) return true
        return (user as any).sites?.includes(i.name)
      })
      .map((i) => ({ id: i.name, name: i.name }))

    return { success: true, sites }
  })

  // ── Content tree ──────────────────────────────────────────
  .get("/:site/tree", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const tree = await buildTree(params.site, version)
    return { success: true, tree, version }
  })

  // ── Settings ──────────────────────────────────────────────
  .get("/:site/settings", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)

    // Always derive siteVersions from actual dirs on disk
    const dataRoot = join(SITES_ROOT, params.site)
    let siteVersions: string[] = settings.siteVersions || ["v1"]
    if (existsSync(dataRoot)) {
      const items = await readdir(dataRoot, { withFileTypes: true })
      siteVersions = items
        .filter((i) => i.isDirectory() && !i.name.startsWith("_") && !i.name.startsWith("."))
        .map((i) => i.name)
    }

    // Sync siteVersions into settings if they drifted
    if (JSON.stringify(siteVersions) !== JSON.stringify(settings.siteVersions)) {
      await saveSiteSettings(params.site, { ...settings, siteVersions })
      settings.siteVersions = siteVersions
    }

    const configPath = join(SITES_ROOT, params.site, "_cms.json")
    let cmsConfig: any = {}
    if (existsSync(configPath)) cmsConfig = JSON.parse(await readFile(configPath, "utf-8"))

    return { success: true, settings: { ...settings, siteVersions }, cmsConfig }
  })

  .put(
    "/:site/settings",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const b = body as any
      const existing = await getSiteSettings(params.site)
      const updates: any = {}

      if (b.activeEditionVersion !== undefined) updates.activeEditionVersion = b.activeEditionVersion
      if (b.defaultSiteVersion !== undefined) updates.defaultSiteVersion = b.defaultSiteVersion

      if (Object.keys(updates).length) {
        await saveSiteSettings(params.site, {
          ...existing,
          ...updates,
          lastUpdated: new Date().toISOString(),
        })
      }

      if (b.cmsConfig !== undefined) {
        const configPath = join(SITES_ROOT, params.site, "_cms.json")
        await writeFile(configPath, JSON.stringify(b.cmsConfig, null, 2))
      }

      return { success: true }
    },
    { body: t.Any() }
  )

  // ── Page read ──────────────────────────────────────────────
  .get("/:site/page", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const file = await resolvePageFile(params.site, version, pagePath)
    if (!file) { set.status = 404; return { error: "Página não encontrada." } }

    return { success: true, data: file.data, ext: file.ext, version }
  })

  // ── Page write ──────────────────────────────────────────────
  .put(
    "/:site/page",
    async ({ params, query, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

      await writePage(params.site, version, pagePath, body)
      return { success: true }
    },
    { body: t.Any() }
  )

  // ── Page create ──────────────────────────────────────────────
  .post(
    "/:site/page",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { path: pagePath, title } = body as any
      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const clean = pagePath.replace(/^\/+|\/+$/g, "")
      const pageTitle = title || clean.split("/").pop() || clean

      const existing = await resolvePageFile(params.site, version, clean)
      if (existing) { set.status = 409; return { error: "Página já existe." } }

      await writePage(params.site, version, clean, {
        layout: "default",
        title: pageTitle,
        blocks: [
          {
            id: `contentmd-${Date.now().toString(36)}`,
            componentName: "ContentMD",
            isHero: false,
            props: { pagePath: clean, fileName: "content.md" },
          },
        ],
      })

      // Create a starter content.md so ContentMD has something to load
      const dirPath = join(SITES_ROOT, params.site, version, clean)
      await writeFile(
        join(dirPath, "content.md"),
        `# ${pageTitle}\n\n`,
        "utf-8"
      )

      return { success: true }
    },
    { body: t.Object({ path: t.String(), title: t.Optional(t.String()) }) }
  )

  // ── Page delete ──────────────────────────────────────────────
  .delete("/:site/page", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem deletar páginas." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    await deletePage(params.site, version, pagePath)
    return { success: true }
  })

  // ── Collection list ──────────────────────────────────────────────
  .get("/:site/collection", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const collectionPath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const items = await listCollectionItems(params.site, version, collectionPath)
    return { success: true, items }
  })

  // ── Collection item create ──────────────────────────────────────────────
  .post(
    "/:site/collection",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { collectionPath, slug, title } = body as any
      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const itemPath = `${collectionPath}/${slug}`.replace(/^\/+/, "")

      const existing = await resolvePageFile(params.site, version, itemPath)
      if (existing) { set.status = 409; return { error: "Item já existe." } }

      await writePage(params.site, version, itemPath, {
        layout: "post",
        title: title || slug,
        date: new Date().toISOString().split("T")[0],
        blocks: [
          {
            id: `contentmd-${Date.now().toString(36)}`,
            componentName: "ContentMD",
            isHero: false,
            props: {},
          },
        ],
      })

      return { success: true, slug: itemPath }
    },
    { body: t.Object({ collectionPath: t.String(), slug: t.String(), title: t.Optional(t.String()) }) }
  )

  // ── Collection item delete ──────────────────────────────────────────────
  .delete("/:site/collection", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem eliminar itens." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const itemPath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    await deleteCollectionItem(params.site, version, itemPath)
    return { success: true }
  })

  // ── Collection order ──────────────────────────────────────────────
  .put("/:site/collection/order", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

    const { path, order } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    await saveCollectionOrder(params.site, version, path.replace(/^\/+|\/+$/g, ""), order)
    return { success: true }
  },
  { body: t.Object({ path: t.String(), order: t.Array(t.String()) }) })

  // ── Tree: create folder ──────────────────────────────────────────────
  .post("/:site/tree/folder", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: folderPath } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const dirPath = join(SITES_ROOT, params.site, version, folderPath.replace(/^\/+|\/+$/g, ""))
    if (existsSync(dirPath)) { set.status = 409; return { error: "Pasta já existe." } }
    await mkdir(dirPath, { recursive: true })
    return { success: true }
  }, { body: t.Object({ path: t.String() }) })

  // ── Tree: create collection ──────────────────────────────────────────────
  .post("/:site/tree/collection", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: colPath, title } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const clean = colPath.replace(/^\/+|\/+$/g, "")
    const colTitle = title || clean.split("/").pop() || clean
    const dirPath = join(SITES_ROOT, params.site, version, clean)
    if (existsSync(dirPath)) { set.status = 409; return { error: "Coleção já existe." } }
    await mkdir(dirPath, { recursive: true })

    await writeFile(
      join(dirPath, "_collection.yml"),
      serializeContent({}, ".yml"),
      "utf-8"
    )

    await writeFile(
      join(dirPath, "_index.yml"),
      serializeContent({
        layout: "default",
        title: colTitle,
        blocks: [
          {
            id: `childgrid-${Date.now().toString(36)}`,
            componentName: "ChildGrid",
            isHero: false,
            props: { parentPath: clean, cWidth: "cw-1" },
          },
        ],
        date: new Date().toISOString().split("T")[0],
        image: [],
      }, ".yml"),
      "utf-8"
    )

    return { success: true }
  }, { body: t.Object({ path: t.String(), title: t.Optional(t.String()) }) })

  // ── Tree: delete node ──────────────────────────────────────────────
  .delete("/:site/tree", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem eliminar." } }
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const nodePath = ((query.path as string) || "").replace(/^\/+|\/+$/g, "")
    const dirPath = join(SITES_ROOT, params.site, version, nodePath)
    if (existsSync(dirPath)) await rm(dirPath, { recursive: true, force: true })
    return { success: true }
  })

  // ── Tree: rename node ──────────────────────────────────────────────
  .post("/:site/tree/rename", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: nodePath, newName } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const src = join(SITES_ROOT, params.site, version, nodePath.replace(/^\/+|\/+$/g, ""))
    const dest = join(dirname(src), newName)
    if (!existsSync(src)) { set.status = 404; return { error: "Não encontrado." } }
    if (existsSync(dest)) { set.status = 409; return { error: "Já existe um item com este nome." } }
    await renameNode(src, dest)

    // Update parent's _order.yml if it references the old name
    const parentDir = dirname(src)
    const orderFile = join(parentDir, "_order.yml")
    if (existsSync(orderFile)) {
      const raw = await readFile(orderFile, "utf-8")
      const meta = await parseContent(raw, ".yml")
      const order: string[] = Array.isArray(meta.order) ? meta.order : []
      const idx = order.indexOf(basename(src))
      if (idx !== -1) {
        order[idx] = newName
        await writeFile(orderFile, serializeContent({ order }, ".yml"), "utf-8")
      }
    }

    return { success: true }
  }, { body: t.Object({ path: t.String(), newName: t.String() }) })

  // ── Tree: copy node ──────────────────────────────────────────────
  .post("/:site/tree/copy", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: nodePath, destination } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const src = join(SITES_ROOT, params.site, version, nodePath.replace(/^\/+|\/+$/g, ""))
    const destDir = join(SITES_ROOT, params.site, version, destination.replace(/^\/+|\/+$/g, ""))
    const dest = join(destDir, basename(src))
    if (!existsSync(src)) { set.status = 404; return { error: "Não encontrado." } }
    if (existsSync(dest)) { set.status = 409; return { error: "Já existe um item com este nome no destino." } }
    await mkdir(destDir, { recursive: true })
    await cp(src, dest, { recursive: true })
    return { success: true }
  }, { body: t.Object({ path: t.String(), destination: t.String() }) })

  // ── Tree: move node ──────────────────────────────────────────────
  .post("/:site/tree/move", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: nodePath, destination, position, referenceNode } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const src = join(SITES_ROOT, params.site, version, nodePath.replace(/^\/+|\/+$/g, ""))
    const destDir = join(SITES_ROOT, params.site, version, destination.replace(/^\/+|\/+$/g, ""))
    const dest = join(destDir, basename(src))
    if (!existsSync(src)) { set.status = 404; return { error: "Não encontrado." } }

    const isSameDir = dirname(src) === destDir
    if (!isSameDir) {
      if (existsSync(dest)) { set.status = 409; return { error: "Já existe um item com este nome no destino." } }
      await mkdir(destDir, { recursive: true })
      await renameNode(src, dest)
    }

    if ((position === "before" || position === "after") && referenceNode) {
      const movedName = basename(src)
      const refName = basename(String(referenceNode).replace(/^\/+|\/+$/g, ""))
      if (refName && refName !== movedName) {
        await applyOrderInFolder(params.site, version, destination, movedName, refName, position)
      }
    }

    return { success: true }
  }, { body: t.Object({
      path: t.String(),
      destination: t.String(),
      position: t.Optional(t.Union([t.Literal("before"), t.Literal("after"), t.Literal("inside")])),
      referenceNode: t.Optional(t.String()),
    }) })

  // ── Versions: create ─────────────────────────────────────────────────
  .post("/:site/versions", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem criar versões." } }

    const b = body as { name: string; from?: string }
    const cleanName = b.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (!cleanName) { set.status = 400; return { error: "Nome de versão inválido." } }
    if (cleanName === "production") { set.status = 400; return { error: "O nome 'production' é reservado." } }

    const destDir = join(SITES_ROOT, params.site, cleanName)
    if (existsSync(destDir)) { set.status = 409; return { error: `A versão "${cleanName}" já existe.` } }

    const settings = await getSiteSettings(params.site)
    const sourceVersion = b.from || settings.activeEditionVersion || "v1"
    const srcDir = join(SITES_ROOT, params.site, sourceVersion)

    if (existsSync(srcDir)) {
      await cp(srcDir, destDir, { recursive: true })
    } else {
      await mkdir(destDir, { recursive: true })
    }

    const existing = settings.siteVersions || ["v1"]
    const newVersions = existing.includes(cleanName) ? existing : [...existing, cleanName]
    await saveSiteSettings(params.site, {
      ...settings,
      siteVersions: newVersions,
      lastUpdated: new Date().toISOString(),
    })

    return { success: true, version: cleanName, versions: newVersions }
  }, { body: t.Object({ name: t.String(), from: t.Optional(t.String()) }) })

  // ── Publish ──────────────────────────────────────────────────────────
  .post("/:site/publish", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem publicar." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const srcDir = join(SITES_ROOT, params.site, version)
    const destDir = join(SITES_ROOT, params.site, "production")

    if (!existsSync(srcDir)) { set.status = 400; return { error: "Versão de edição não encontrada." } }

    if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true })
    await cp(srcDir, destDir, { recursive: true })

    const publishedAt = new Date().toISOString()
    // Only update publish metadata — never touch activeEditionVersion so the CMS
    // continues editing the same draft layer after publish.
    await saveSiteSettings(params.site, {
      ...settings,
      activeEditionVersion: settings.activeEditionVersion || "v1",
      lastPublished: publishedAt,
      publishedFrom: version,
    })

    return { success: true, publishedAt, from: version }
  })

  // ── Global read ──────────────────────────────────────────────
  .get("/:site/global", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const globalDir = join(SITES_ROOT, params.site, version, "_global")

    if (!existsSync(globalDir)) return { success: true, global: {} }

    const files = await readdir(globalDir)
    const result: Record<string, any> = {}

    for (const file of files) {
      const ext = extname(file)
      if (![".json", ".yml"].includes(ext)) continue
      const key = file.replace(ext, "")
      const raw = await readFile(join(globalDir, file), "utf-8")
      result[key] = { data: await parseContent(raw, ext), ext }
    }

    return { success: true, global: result }
  })

  // ── Global write ──────────────────────────────────────────────
  .put(
    "/:site/global/:key",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const globalDir = join(SITES_ROOT, params.site, version, "_global")

      await mkdir(globalDir, { recursive: true })

      let targetFile = join(globalDir, `${params.key}.json`)
      let ext = ".json"
      const ymlFile = join(globalDir, `${params.key}.yml`)
      if (existsSync(ymlFile)) { targetFile = ymlFile; ext = ".yml" }

      await writeFile(targetFile, serializeContent(body, ext))
      return { success: true }
    },
    { body: t.Any() }
  )

  // ── Markdown read ──────────────────────────────────────────────
  .get("/:site/markdown", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const filePath = join(SITES_ROOT, params.site, version, (query.path as string || ""))

    if (!existsSync(filePath)) { set.status = 404; return { error: "Ficheiro não encontrado." } }

    const content = await readFile(filePath, "utf-8")
    return { success: true, content }
  })

  // ── Markdown write ──────────────────────────────────────────────
  .put(
    "/:site/markdown",
    async ({ params, query, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const filePath = join(SITES_ROOT, params.site, version, (query.path as string || ""))

      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, (body as any).content)
      return { success: true }
    },
    { body: t.Object({ content: t.String() }) }
  )

  // ── Media: list ──────────────────────────────────────────────
  .get("/:site/media", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const items = await listMedia(params.site, version, query.path as string || "")
    return { success: true, items }
  })

  // ── Media: serve raw file ──────────────────────────────────────────────
  .get("/:site/media/serve", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const filePath = join(SITES_ROOT, params.site, version, (query.path as string || "").replace(/^\/+/, ""))

    if (!existsSync(filePath)) { set.status = 404; return { error: "Ficheiro não encontrado." } }
    return Bun.file(filePath)
  })

  // ── Media: upload ──────────────────────────────────────────────
  .post(
    "/:site/media/upload",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const { file, path: uploadPath } = body as { file: File; path?: string }

      const targetDir = join(SITES_ROOT, params.site, version, (uploadPath || "").replace(/^\/+/, ""))
      await mkdir(targetDir, { recursive: true })
      await Bun.write(join(targetDir, file.name), file)

      return { success: true, name: file.name }
    },
    { body: t.Object({ file: t.File(), path: t.Optional(t.String()) }) }
  )

  // ── Media: delete ──────────────────────────────────────────────
  .delete("/:site/media", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    await deleteMedia(params.site, version, query.path as string || "")
    return { success: true }
  })

  // ── Media: rename ──────────────────────────────────────────────
  .put(
    "/:site/media/rename",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      await renameMedia(params.site, version, (body as any).path, (body as any).newName)
      return { success: true }
    },
    { body: t.Object({ path: t.String(), newName: t.String() }) }
  )

  // ── Media: move ──────────────────────────────────────────────
  .put(
    "/:site/media/move",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      await moveMedia(params.site, version, (body as any).path, (body as any).destination)
      return { success: true }
    },
    { body: t.Object({ path: t.String(), destination: t.String() }) }
  )

  // ── Media: copy ──────────────────────────────────────────────
  .put(
    "/:site/media/copy",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      await copyMedia(params.site, version, (body as any).path)
      return { success: true }
    },
    { body: t.Object({ path: t.String() }) }
  )

  // ── Analytics ─────────────────────────────────────────────────
  .get("/:site/analytics", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const days = Math.min(parseInt((query as any).days as string) || 30, 90)
    const analyticsDir = join(SITES_ROOT, params.site, "_analytics")

    if (!existsSync(analyticsDir)) return { days: [], topPages: [], topRefs: [], devices: {}, totals: { views: 0, visitors: 0 } }

    // Build list of dates to read
    const dates: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }

    // Read each JSONL file line by line
    async function readDay(date: string): Promise<any[]> {
      const file = join(analyticsDir, `${date}.jsonl`)
      if (!existsSync(file)) return []
      const lines: any[] = []
      const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
      for await (const line of rl) {
        try { lines.push(JSON.parse(line)) } catch { /* skip */ }
      }
      return lines
    }

    const pageViews: Record<string, number> = {}
    const refViews: Record<string, number> = {}
    const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 }
    const dayStats: { date: string; views: number; visitors: number }[] = []

    for (const date of dates) {
      const rows = await readDay(date)
      const dayVisitors = new Set<string>()
      for (const r of rows) {
        pageViews[r.path] = (pageViews[r.path] || 0) + 1
        if (r.ref) refViews[r.ref] = (refViews[r.ref] || 0) + 1
        deviceCounts[r.d as string] = (deviceCounts[r.d as string] || 0) + 1
        dayVisitors.add(r.vh)
      }
      dayStats.push({ date, views: rows.length, visitors: dayVisitors.size })
    }

    const totalViews = dayStats.reduce((s, d) => s + d.views, 0)
    // Approximate unique across whole period (dedupe by vh across all days)
    const allRows = await Promise.all(dates.map(readDay)).then(a => a.flat())
    const uniqueVh = new Set(allRows.map(r => r.vh))

    const topPages = Object.entries(pageViews)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, views]) => ({ path, views }))

    const topRefs = Object.entries(refViews)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([ref, views]) => ({ ref, views }))

    return {
      days: dayStats,
      topPages,
      topRefs,
      devices: deviceCounts,
      totals: { views: totalViews, visitors: uniqueVh.size },
    }
  })
