import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readdir, writeFile, mkdir, rm, readFile, rename as renameNode, cp, appendFile } from "node:fs/promises"
import { existsSync, createReadStream } from "node:fs"
import { join, extname, dirname, basename } from "node:path"
import sharp from "sharp"
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
  saveRevision,
  listRevisions,
  getRevision,
} from "../lib/content"
import {
  getModel,
  applyModel,
  defaultPageTemplate,
  defaultCollectionItemTemplate,
  resolveDefaultModel,
} from "../lib/models"
import { JWT_SECRET } from "../lib/config"

function isLegacyBackupDir(name: string): boolean {
  return /backup-\d{10,}/.test(name)
}

async function getUser(jwt: any, token: string | undefined, expectedSite?: string) {
  if (!token) return null
  const user = await jwt.verify(token) as any
  if (!user) return null
  // URL site must match the site the user authenticated for — prevents
  // cross-site access via cookie reuse / URL tampering.
  if (expectedSite && user.site !== expectedSite) return null
  return user
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
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const tree = await buildTree(params.site, version)
    return { success: true, tree, version }
  })

  // ── Settings ──────────────────────────────────────────────
  .get("/:site/settings", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)

    // Always derive siteVersions from actual dirs on disk
    const dataRoot = join(SITES_ROOT, params.site)
    let siteVersions: string[] = settings.siteVersions || ["v1"]
    if (existsSync(dataRoot)) {
      const items = await readdir(dataRoot, { withFileTypes: true })
      siteVersions = items
        .filter((i) => i.isDirectory() && !i.name.startsWith("_") && !i.name.startsWith(".") && !isLegacyBackupDir(i.name))
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const b = body as any
      const existing = await getSiteSettings(params.site)
      const updates: any = {}

      if (b.activeEditionVersion !== undefined) updates.activeEditionVersion = b.activeEditionVersion
      if (b.defaultSiteVersion !== undefined) updates.defaultSiteVersion = b.defaultSiteVersion
      if (b.breadcrumbMode !== undefined) updates.breadcrumbMode = b.breadcrumbMode
      if (b.blocksGap      !== undefined) updates.blocksGap      = b.blocksGap
      if (b.siteUrl        !== undefined) updates.siteUrl        = b.siteUrl

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
    {
      body: t.Object({
        activeEditionVersion: t.Optional(t.String()),
        defaultSiteVersion:   t.Optional(t.String()),
        breadcrumbMode:       t.Optional(t.String()),
        blocksGap:            t.Optional(t.String()),
        siteUrl:              t.Optional(t.String()),
        cmsConfig:            t.Optional(t.Any()),
      })
    }
  )

  // ── Page read ──────────────────────────────────────────────
  .get("/:site/page", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

      // Snapshot current content before overwriting
      const existing = await resolvePageFile(params.site, version, pagePath)
      if (existing) {
        if (query.silent !== "true") {
          // Explicit save — always create a revision
          await saveRevision(params.site, version, pagePath, existing.data, user.username)
        } else {
          // Auto-save — checkpoint only if last revision is >5 minutes old
          const revisions = await listRevisions(params.site, version, pagePath)
          const lastRev = revisions[0]
          const fiveMinAgo = Date.now() - 5 * 60 * 1000
          if (!lastRev || new Date(lastRev.savedAt).getTime() < fiveMinAgo) {
            await saveRevision(params.site, version, pagePath, existing.data, user.username)
          }
        }
      }

      await writePage(params.site, version, pagePath, body)
      return { success: true }
    },
    { body: t.Any() }
  )

  // ── Page create ──────────────────────────────────────────────
  .post(
    "/:site/page",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { path: pagePath, title, model: modelName } = body as any
      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const clean = pagePath.replace(/^\/+|\/+$/g, "")
      const pageTitle = title || clean.split("/").pop() || clean

      const existing = await resolvePageFile(params.site, version, clean)
      if (existing) { set.status = 409; return { error: "Página já existe." } }

      // Resolve effective model: explicit pick → global "normal-page" default → hard fallback
      const model = modelName
        ? await getModel(params.site, modelName)
        : await resolveDefaultModel(params.site)
      const { data, needsContentMd } = model
        ? applyModel(model, { title: pageTitle, slug: clean })
        : defaultPageTemplate(clean)
      const effectiveModelName = modelName || model?.name

      await writePage(params.site, version, clean, {
        ...data,
        title: pageTitle,
        ...(effectiveModelName ? { model: effectiveModelName } : {}),
      })

      if (needsContentMd) {
        const dirPath = join(SITES_ROOT, params.site, version, clean)
        await writeFile(join(dirPath, "content.md"), `# ${pageTitle}\n\n`, "utf-8")
      }

      return { success: true }
    },
    {
      body: t.Object({
        path: t.String(),
        title: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )

  // ── Page delete ──────────────────────────────────────────────
  .delete("/:site/page", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem deletar páginas." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    await deletePage(params.site, version, pagePath)
    return { success: true }
  })

  // ── Page revision list ───────────────────────────────────────────
  .get("/:site/page/revisions", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const revisions = await listRevisions(params.site, version, pagePath)
    return { success: true, revisions }
  })

  // ── Page revision detail ─────────────────────────────────────────
  .get("/:site/page/revisions/:revId", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const revision = await getRevision(params.site, version, pagePath, params.revId)
    if (!revision) { set.status = 404; return { error: "Revisão não encontrada." } }
    return { success: true, revision }
  })

  // ── Restore page revision ────────────────────────────────────────
  .post("/:site/page/revisions/:revId/restore", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const pagePath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const revision = await getRevision(params.site, version, pagePath, params.revId)
    if (!revision) { set.status = 404; return { error: "Revisão não encontrada." } }

    // Save current state before restoring (so the restore itself is undoable)
    const current = await resolvePageFile(params.site, version, pagePath)
    if (current) {
      await saveRevision(params.site, version, pagePath, current.data, user.username)
    }

    await writePage(params.site, version, pagePath, revision.data)
    return { success: true }
  })

  // ── Collection list ──────────────────────────────────────────────
  .get("/:site/collection", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const collectionPath = (query.path as string || "").replace(/^\/+|\/+$/g, "")

    const items = await listCollectionItems(params.site, version, collectionPath)

    // Expose collection-level metadata (currently: itemModel) so the UI can
    // pre-select the right model when creating a new item.
    let collection: any = {}
    for (const f of ["_collection.yml", "_collection.json"]) {
      const colFile = join(SITES_ROOT, params.site, version, collectionPath, f)
      if (existsSync(colFile)) {
        const raw = await readFile(colFile, "utf-8")
        collection = await parseContent(raw, extname(f))
        break
      }
    }

    return { success: true, items, collection }
  })

  // ── Collection item create ──────────────────────────────────────────────
  .post(
    "/:site/collection",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { collectionPath, slug, title, model: modelOverride } = body as any
      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const itemPath = `${collectionPath}/${slug}`.replace(/^\/+/, "")
      const itemTitle = title || slug

      const existing = await resolvePageFile(params.site, version, itemPath)
      if (existing) { set.status = 409; return { error: "Item já existe." } }

      // Resolve effective model: explicit override → collection's stored itemModel → default
      let effectiveModelName: string | null = modelOverride || null
      if (!effectiveModelName) {
        const cleanColl = collectionPath.replace(/^\/+|\/+$/g, "")
        for (const f of ["_collection.yml", "_collection.json"]) {
          const colPath = join(SITES_ROOT, params.site, version, cleanColl, f)
          if (existsSync(colPath)) {
            const raw = await readFile(colPath, "utf-8")
            const meta = await parseContent(raw, extname(f))
            if (meta?.itemModel) effectiveModelName = String(meta.itemModel)
            break
          }
        }
      }

      const model = effectiveModelName ? await getModel(params.site, effectiveModelName) : null
      const { data, needsContentMd } = model
        ? applyModel(model, { title: itemTitle, slug: itemPath })
        : defaultCollectionItemTemplate()

      await writePage(params.site, version, itemPath, {
        ...data,
        title: itemTitle,
        ...(effectiveModelName ? { model: effectiveModelName } : {}),
      })

      if (needsContentMd) {
        const dirPath = join(SITES_ROOT, params.site, version, itemPath)
        await writeFile(join(dirPath, "content.md"), `# ${itemTitle}\n\n`, "utf-8")
      }

      return { success: true, slug: itemPath }
    },
    {
      body: t.Object({
        collectionPath: t.String(),
        slug: t.String(),
        title: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )

  // ── Collection item delete ──────────────────────────────────────────────
  .delete("/:site/collection", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: colPath, title, itemModel } = body as any
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const clean = colPath.replace(/^\/+|\/+$/g, "")
    const colTitle = title || clean.split("/").pop() || clean
    const dirPath = join(SITES_ROOT, params.site, version, clean)
    if (existsSync(dirPath)) { set.status = 409; return { error: "Coleção já existe." } }
    await mkdir(dirPath, { recursive: true })

    const collectionMeta: Record<string, any> = {}
    if (itemModel) collectionMeta.itemModel = String(itemModel)

    await writeFile(
      join(dirPath, "_collection.yml"),
      serializeContent(collectionMeta, ".yml"),
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
  }, {
    body: t.Object({
      path: t.String(),
      title: t.Optional(t.String()),
      itemModel: t.Optional(t.String()),
    }),
  })

  // ── Tree: delete node ──────────────────────────────────────────────
  .delete("/:site/tree", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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

  // ── Tree: duplicate node (same parent, new name) ────────────────
  .post("/:site/tree/duplicate", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }
    const { path: nodePath, newName } = body as any
    const safeName = (newName as string).trim().replace(/[^a-z0-9_\-]/gi, "_").replace(/^_+|_+$/g, "") || "copia"
    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const src = join(SITES_ROOT, params.site, version, nodePath.replace(/^\/+|\/+$/g, ""))
    const dest = join(dirname(src), safeName)
    if (!existsSync(src)) { set.status = 404; return { error: "Não encontrado." } }
    if (existsSync(dest)) { set.status = 409; return { error: "Já existe uma página com esse nome." } }
    await cp(src, dest, { recursive: true })
    // Remove revision history from the copy — it starts fresh
    await rm(join(dest, "_revisions"), { recursive: true, force: true })
    return { success: true }
  }, { body: t.Object({ path: t.String(), newName: t.String() }) })

  // ── Tree: move node ──────────────────────────────────────────────
  .post("/:site/tree/move", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem criar versões." } }

    const b = body as { name: string; from?: string }
    const cleanName = b.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
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
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site)
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site)
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
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
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const settings = await getSiteSettings(params.site)
    const version = getActiveVersion(settings)
    const items = await listMedia(params.site, version, query.path as string || "")
    return { success: true, items }
  })

  // ── Media: serve raw file ──────────────────────────────────────────────
  .get("/:site/media/serve", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const { file, path: uploadPath } = body as { file: File; path?: string }

      const targetDir = join(SITES_ROOT, params.site, version, (uploadPath || "").replace(/^\/+/, ""))
      await mkdir(targetDir, { recursive: true })

      const isImage = file.type.startsWith("image/") && !file.type.includes("svg")
      let outBuffer: Buffer | Uint8Array
      let outName = file.name

      if (isImage) {
        const raw = Buffer.from(await file.arrayBuffer())
        const isPng = file.type === "image/png"
        let img = sharp(raw).rotate() // auto-orient from EXIF
          .resize({ width: 1500, height: 800, fit: "inside", withoutEnlargement: true })

        const MAX_BYTES = 2 * 1024 * 1024 // WebP is ~30% smaller, allow 2 MB
        if (isPng) {
          // Keep PNG to preserve transparency (logos, cutouts)
          outBuffer = await img.png({ compressionLevel: 8 }).toBuffer()
          outName = file.name.replace(/\.[^.]+$/, ".png")
        } else {
          // Convert to WebP; step down quality until under 2 MB
          let quality = 85
          let buf: Buffer
          do {
            buf = await img.clone().webp({ quality }).toBuffer()
            quality -= 15
          } while (buf.byteLength > MAX_BYTES && quality > 10)
          outBuffer = buf
          outName = file.name.replace(/\.[^.]+$/, ".webp")
        }
      } else {
        outBuffer = Buffer.from(await file.arrayBuffer())
      }

      await Bun.write(join(targetDir, outName), outBuffer)
      return { success: true, name: outName }
    },
    { body: t.Object({ file: t.File(), path: t.Optional(t.String()) }) }
  )

  // ── Media: delete ──────────────────────────────────────────────
  .delete("/:site/media", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
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
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      await copyMedia(params.site, version, (body as any).path)
      return { success: true }
    },
    { body: t.Object({ path: t.String() }) }
  )

  // ── Component registry ───────────────────────────────────────
  .get("/:site/components", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const registryPath = join(import.meta.dir, "..", "ui", "app", "data", "components.json")
    if (!existsSync(registryPath)) { set.status = 404; return { error: "Registo de componentes não encontrado." } }

    const raw = JSON.parse(await readFile(registryPath, "utf-8"))
    const includeHidden = (query as any).includeHidden === "true"
    const components = (raw.components || []).filter((c: any) => includeHidden || !c.cms_hidden)

    return {
      success: true,
      components,
      page_types: raw.page_types || [],
      fieldTypes: raw._meta?.fieldTypes || {},
    }
  })

  // ── AI: apply spec (batch page create/update) ─────────────────
  .post(
    "/:site/apply-spec",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { pages } = body as any
      if (!Array.isArray(pages) || pages.length === 0) {
        set.status = 400; return { error: "Campo 'pages' é obrigatório e deve ser um array." }
      }

      const settings = await getSiteSettings(params.site)
      const version = getActiveVersion(settings)
      const results: { path: string; status: "created" | "updated" | "skipped" | "error"; error?: string }[] = []

      for (const page of pages) {
        const pagePath = String(page.path || "").replace(/^\/+|\/+$/g, "")
        if (!pagePath) {
          results.push({ path: "", status: "error", error: "path obrigatório" })
          continue
        }

        try {
          const existing = await resolvePageFile(params.site, version, pagePath)
          if (existing && !page.overwrite) {
            results.push({ path: pagePath, status: "skipped" })
            continue
          }

          const pageTitle = page.title || pagePath.split("/").pop() || pagePath

          const blocks = Array.isArray(page.blocks)
            ? page.blocks.map((b: any, i: number) => ({
                id: `${String(b.componentName).toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36)}-${i}`,
                componentName: b.componentName,
                isHero: b.isHero ?? false,
                props: b.props ?? {},
              }))
            : []

          const pageData: any = {
            ...(page.data ?? {}),
            title: pageTitle,
            layout: page.data?.layout ?? "default",
            blocks,
          }

          await writePage(params.site, version, pagePath, pageData)

          if (page.markdown != null) {
            const dirPath = join(SITES_ROOT, params.site, version, pagePath)
            await mkdir(dirPath, { recursive: true })
            await writeFile(join(dirPath, "content.md"), page.markdown, "utf-8")
          }

          results.push({ path: pagePath, status: existing ? "updated" : "created" })
        } catch (err: any) {
          results.push({ path: pagePath, status: "error", error: err.message })
        }
      }

      const failed = results.filter(r => r.status === "error").length
      return { success: failed === 0, results }
    },
    { body: t.Any() }
  )

  // ── Newsletter — public subscribe ────────────────────────────
  .post("/:site/newsletter/subscribe", async ({ params, body, set }) => {
    const { email, name } = body as any
    if (!email || typeof email !== "string" || !email.includes("@")) {
      set.status = 400; return { error: "Email inválido." }
    }
    const dir = join(SITES_ROOT, params.site, "_newsletter")
    const file = join(dir, "subscribers.json")
    await mkdir(dir, { recursive: true })
    let subscribers: any[] = []
    try { subscribers = JSON.parse(await readFile(file, "utf-8")) } catch { /* first subscriber */ }
    if (!subscribers.find((s: any) => s.email === email.toLowerCase().trim())) {
      subscribers.push({ email: email.toLowerCase().trim(), name: name || "", subscribedAt: new Date().toISOString() })
      await writeFile(file, JSON.stringify(subscribers, null, 2), "utf-8")
    }
    return { success: true }
  }, { body: t.Any() })

  // ── Form submissions — public submit ─────────────────────────
  .post("/:site/inscricoes", async ({ params, body, set }) => {
    const { name, email, formId, ...rest } = body as any
    if (!email || typeof email !== "string") { set.status = 400; return { error: "Email obrigatório." } }
    const dir = join(SITES_ROOT, params.site, "_inscricoes")
    const file = join(dir, "inscricoes.json")
    await mkdir(dir, { recursive: true })
    let inscricoes: any[] = []
    try { inscricoes = JSON.parse(await readFile(file, "utf-8")) } catch { /* first entry */ }
    const entry = { id: crypto.randomUUID(), submittedAt: new Date().toISOString(), name, email, formId, ...rest }
    inscricoes.push(entry)
    await writeFile(file, JSON.stringify(inscricoes, null, 2), "utf-8")
    return { success: true, id: entry.id }
  }, { body: t.Any() })

  // ── Analytics — public event tracking ────────────────────────
  .post("/:site/analytics", async ({ params, body, request }) => {
    const { path: pagePath, ref, ua, ip } = body as any
    const dir = join(SITES_ROOT, params.site, "_analytics")
    await mkdir(dir, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    const file = join(dir, `${date}.jsonl`)
    const userAgent = ua || request.headers.get("user-agent") || ""
    const isMobile = /mobile|android/i.test(userAgent)
    const isTablet = /tablet|ipad/i.test(userAgent)
    const device = isTablet ? "tablet" : isMobile ? "mobile" : "desktop"
    const vh = createHash("sha256").update(`${ip || ""}|${userAgent}|${date}`).digest("hex").slice(0, 16)
    await appendFile(file, JSON.stringify({ path: pagePath || "/", ref: ref || "", d: device, vh, ts: Date.now() }) + "\n", "utf-8")
    return { success: true }
  }, { body: t.Any() })

  // ── Newsletter subscribers ─────────────────────────────────
  .get("/:site/newsletter", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const file = join(SITES_ROOT, params.site, "_newsletter", "subscribers.json")
    try {
      const raw = await readFile(file, "utf-8")
      const subscribers = JSON.parse(raw)
      return { subscribers }
    } catch {
      return { subscribers: [] }
    }
  })

  .delete("/:site/newsletter", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const email = ((query as any).email as string || "").trim().toLowerCase()
    if (!email) { set.status = 400; return { error: "Email obrigatório." } }

    const file = join(SITES_ROOT, params.site, "_newsletter", "subscribers.json")
    try {
      const raw = await readFile(file, "utf-8")
      const subscribers = JSON.parse(raw)
      const filtered = subscribers.filter((s: any) => s.email !== email)
      await writeFile(file, JSON.stringify(filtered, null, 2), "utf-8")
      return { success: true }
    } catch {
      set.status = 404; return { error: "Lista de subscribers não encontrada." }
    }
  })

  .get("/:site/inscricoes", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }

    const file = join(SITES_ROOT, params.site, "_inscricoes", "inscricoes.json")
    try {
      const raw = await readFile(file, "utf-8")
      return { inscricoes: JSON.parse(raw) }
    } catch {
      return { inscricoes: [] }
    }
  })

  .delete("/:site/inscricoes", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

    const id = ((query as any).id as string || "").trim()
    if (!id) { set.status = 400; return { error: "ID obrigatório." } }

    const file = join(SITES_ROOT, params.site, "_inscricoes", "inscricoes.json")
    try {
      const raw = await readFile(file, "utf-8")
      const inscricoes = JSON.parse(raw)
      const filtered = inscricoes.filter((i: any) => i.id !== id)
      if (filtered.length === inscricoes.length) { set.status = 404; return { error: "Inscrição não encontrada." } }
      await writeFile(file, JSON.stringify(filtered, null, 2), "utf-8")
      return { success: true }
    } catch {
      set.status = 404; return { error: "Ficheiro de inscrições não encontrado." }
    }
  }, { query: t.Object({ id: t.String() }) })

  .get("/:site/analytics", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
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

  // ── Instagram import ───────────────────────────────────────────────────────
  .get("/:site/instagram-import", async ({ params, query, cookie: { cms_token }, jwt, set }) => {
    const payload = await jwt.verify(cms_token?.value)
    if (!payload) { set.status = 401; return { error: "Não autenticado" } }

    const username = (query.username as string || "").replace(/^@/, "").trim()
    if (!username) { set.status = 400; return { error: "Username obrigatório" } }

    try {
      // Try Instagram's unofficial profile JSON endpoint
      const res = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "X-IG-App-ID": "936619743392459",
            "Referer": `https://www.instagram.com/${username}/`,
          },
        }
      )

      if (!res.ok) {
        set.status = 502
        return { error: `Instagram respondeu com ${res.status}. O perfil pode ser privado ou o username incorreto.` }
      }

      const data = await res.json() as any
      const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges ?? []

      if (!edges.length) {
        return { items: [], warning: "Nenhuma publicação encontrada. O perfil pode ser privado." }
      }

      const items = edges.slice(0, 9).map((edge: any) => {
        const node = edge.node
        const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text ?? ""
        const isVideo = node.is_video
        return {
          src: isVideo ? (node.video_url ?? node.display_url) : node.display_url,
          type: isVideo ? "video" : "image",
          title: caption.split("\n")[0].slice(0, 80) || "",
          description: "",
          category: "",
          alt: `${username} — Instagram`,
        }
      })

      return { items }
    } catch (e: any) {
      set.status = 502
      return { error: `Erro ao importar do Instagram: ${e?.message ?? e}` }
    }
  }, { query: t.Object({ username: t.String() }) })
