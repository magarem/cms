import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, extname } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"
import { getZapiStatus } from "../lib/whatsapp"

const SIRIUS_DIR   = join(SITES_ROOT, "_sirius")
const VENDOR_FILE  = join(SIRIUS_DIR, "vendor.json")
const VENDOR_MEDIA = join(SIRIUS_DIR, "media")

async function readVendor() {
  try { return JSON.parse(await readFile(VENDOR_FILE, "utf-8")) } catch { return {} }
}

async function requireRoot(jwt: any, token: string | undefined, set: any) {
  if (!token) { set.status = 401; return null }
  const user = await jwt.verify(token) as any
  if (!user) { set.status = 401; return null }
  if (!(user.sites as string[])?.includes("*")) { set.status = 403; return null }
  return user
}

export const settingsRoutes = new Elysia({ prefix: "/admin/settings" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // Public: serve vendor media (no auth — needed so logos load in PDFs/emails)
  .get("/vendor/media", async ({ query, set }) => {
    const file = (query.file as string || "").replace(/\.\./g, "")
    if (!file) { set.status = 400; return { error: "file param required" } }
    const filePath = join(VENDOR_MEDIA, file)
    if (!existsSync(filePath)) { set.status = 404; return { error: "Ficheiro não encontrado." } }
    return Bun.file(filePath)
  })

  .get("/vendor", async ({ cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    return { success: true, vendor: await readVendor() }
  })

  .put("/vendor", async ({ body, cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    await mkdir(SIRIUS_DIR, { recursive: true })
    await writeFile(VENDOR_FILE, JSON.stringify(body, null, 2))
    return { success: true, vendor: body }
  }, {
    body: t.Object({
      name:    t.Optional(t.String()),
      logo:    t.Optional(t.String()),
      address: t.Optional(t.String()),
      phone:   t.Optional(t.String()),
      email:   t.Optional(t.String()),
      website: t.Optional(t.String()),
      taxId:   t.Optional(t.String()),
    })
  })

  // WhatsApp connection status
  .get("/whatsapp/status", async ({ cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    try {
      const status = await getZapiStatus()
      return { success: true, status }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Upload vendor logo
  .post("/vendor/upload", async ({ body, cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    await mkdir(VENDOR_MEDIA, { recursive: true })

    const { file } = body as { file: File }
    const ext     = extname(file.name).toLowerCase() || ".png"
    const outName = `logo-${Date.now()}${ext}`
    const outPath = join(VENDOR_MEDIA, outName)

    await Bun.write(outPath, Buffer.from(await file.arrayBuffer()))
    return { success: true, file: outName }
  }, {
    body: t.Object({ file: t.File() })
  })
