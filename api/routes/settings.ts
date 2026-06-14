import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"

const SIRIUS_DIR  = join(SITES_ROOT, "_sirius")
const VENDOR_FILE = join(SIRIUS_DIR, "vendor.json")

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
