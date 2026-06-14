import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"

const CLIENTS_DIR  = join(SITES_ROOT, "_sirius", "clients")
const VENDOR_FILE  = join(SITES_ROOT, "_sirius", "vendor.json")

const CONTROL_USERNAME = process.env.CONTROL_USERNAME || "admin"
const CONTROL_PASSWORD = process.env.CONTROL_PASSWORD || "changeme"

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf-8")) as T } catch { return fallback }
}

async function requireControl(jwt: any, token: string | undefined, set: any) {
  if (!token) { set.status = 401; return null }
  const payload = await jwt.verify(token) as any
  if (!payload || payload.role !== "control") { set.status = 401; return null }
  return payload
}

export const controlRoutes = new Elysia({ prefix: "/control" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // ── Login ──────────────────────────────────────────────────
  .post("/login", async ({ body, jwt, cookie: { control_token }, set }) => {
    if (body.username !== CONTROL_USERNAME || body.password !== CONTROL_PASSWORD) {
      set.status = 401
      return { error: "Credenciais inválidas." }
    }
    const token = await jwt.sign({ role: "control", iat: Math.floor(Date.now() / 1000) })
    control_token.set({ value: token, httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 })
    return { success: true }
  }, {
    body: t.Object({ username: t.String(), password: t.String() })
  })

  // ── Logout ─────────────────────────────────────────────────
  .post("/logout", ({ cookie: { control_token } }) => {
    control_token.set({ value: "", maxAge: 0, path: "/" })
    return { success: true }
  })

  // ── Verify session ─────────────────────────────────────────
  .get("/me", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    return { success: true, role: "control" }
  })

  // ── Vendor info ────────────────────────────────────────────
  .get("/vendor", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const vendor = await readJson<any>(VENDOR_FILE, {})
    return { success: true, vendor }
  })

  // ── List clients ───────────────────────────────────────────
  .get("/clients", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    try {
      const files = (await readdir(CLIENTS_DIR)).filter(f => f.endsWith(".json") && !f.includes("-"))
      const clients = await Promise.all(files.map(f => readJson<any>(join(CLIENTS_DIR, f), {})))
      return { success: true, clients: clients.filter(c => c.id) }
    } catch { return { success: true, clients: [] } }
  })

  // ── Get client ─────────────────────────────────────────────
  .get("/clients/:id", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile  = await readJson<any>(join(CLIENTS_DIR, `${params.id}.json`), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }
    const invoices = await readJson<any[]>(join(CLIENTS_DIR, `${params.id}-invoices.json`), [])
    return { success: true, client: { ...profile, invoices } }
  })
