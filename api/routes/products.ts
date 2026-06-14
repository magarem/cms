import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"
import { randomUUID } from "node:crypto"

const SIRIUS_DIR    = join(SITES_ROOT, "_sirius")
const PRODUCTS_FILE = join(SIRIUS_DIR, "products.json")

async function readProducts(): Promise<any[]> {
  try { return JSON.parse(await readFile(PRODUCTS_FILE, "utf-8")) } catch { return [] }
}

async function writeProducts(products: any[]) {
  await mkdir(SIRIUS_DIR, { recursive: true })
  await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2))
}

async function requireRoot(jwt: any, token: string | undefined, set: any) {
  if (!token) { set.status = 401; return null }
  const user = await jwt.verify(token) as any
  if (!user) { set.status = 401; return null }
  if (!(user.sites as string[])?.includes("*")) { set.status = 403; return null }
  return user
}

export const productsRoutes = new Elysia({ prefix: "/admin/products" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  .get("/", async ({ cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    return { success: true, products: await readProducts() }
  })

  .post("/", async ({ body, cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const products = await readProducts()
    const product = {
      id: `prod-${randomUUID().slice(0, 8)}`,
      ...body,
      active: true,
      createdAt: new Date().toISOString(),
    }
    products.push(product)
    await writeProducts(products)
    return { success: true, product }
  }, {
    body: t.Object({
      type:        t.Union([t.Literal("product"), t.Literal("service")]),
      name:        t.String(),
      description: t.Optional(t.String()),
      price:       t.Number(),
      unit:        t.Optional(t.String()),
    })
  })

  .put("/:id", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const products = await readProducts()
    const idx = products.findIndex(p => p.id === params.id)
    if (idx === -1) { set.status = 404; return { error: "Produto não encontrado." } }
    products[idx] = { ...products[idx], ...body }
    await writeProducts(products)
    return { success: true, product: products[idx] }
  }, {
    body: t.Object({
      type:        t.Optional(t.Union([t.Literal("product"), t.Literal("service")])),
      name:        t.Optional(t.String()),
      description: t.Optional(t.String()),
      price:       t.Optional(t.Number()),
      unit:        t.Optional(t.String()),
      active:      t.Optional(t.Boolean()),
    })
  })

  .delete("/:id", async ({ params, cookie: { cms_token }, jwt, set }) => {
    if (!await requireRoot(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const products = (await readProducts()).filter(p => p.id !== params.id)
    await writeProducts(products)
    return { success: true }
  })
