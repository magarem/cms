import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"
import { randomUUID } from "node:crypto"
import { sendInvoiceEmail, sendPortalAccessEmail } from "../lib/email"
import { sendInvoiceWhatsApp } from "../lib/whatsapp"
import { signClientToken } from "../lib/invoice-token"

const CLIENTS_DIR  = join(SITES_ROOT, "_sirius", "clients")
const VENDOR_FILE  = join(SITES_ROOT, "_sirius", "vendor.json")

const CONTROL_USERNAME = process.env.CONTROL_USERNAME || "admin"
const CONTROL_PASSWORD = process.env.CONTROL_PASSWORD || "changeme"

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf-8")) as T } catch { return fallback }
}
async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2))
}
async function ensureClientsDir() { await mkdir(CLIENTS_DIR, { recursive: true }) }

function profilePath(id: string)  { return join(CLIENTS_DIR, `${id}.json`) }
function sitesPath(id: string)    { return join(CLIENTS_DIR, `${id}-sites.json`) }
function invoicesPath(id: string) { return join(CLIENTS_DIR, `${id}-invoices.json`) }
function supportPath(id: string)  { return join(CLIENTS_DIR, `${id}-support.json`) }

async function requireControl(jwt: any, token: string | undefined, set: any) {
  if (!token) { set.status = 401; return null }
  const payload = await jwt.verify(token) as any
  if (!payload || payload.role !== "control") { set.status = 401; return null }
  return payload
}

const invoiceStatusT = t.Union([t.Literal("pending"), t.Literal("paid"), t.Literal("overdue"), t.Literal("cancelled")])
const ticketStatusT  = t.Union([t.Literal("open"), t.Literal("in_progress"), t.Literal("resolved"), t.Literal("closed")])

export const controlRoutes = new Elysia({ prefix: "/control" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // ── Auth ──────────────────────────────────────────────────
  .post("/login", async ({ body, jwt, cookie: { control_token }, set }) => {
    if (body.username !== CONTROL_USERNAME || body.password !== CONTROL_PASSWORD) {
      set.status = 401; return { error: "Credenciais inválidas." }
    }
    const token = await jwt.sign({ role: "control", iat: Math.floor(Date.now() / 1000) })
    control_token.set({ value: token, httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 })
    return { success: true }
  }, { body: t.Object({ username: t.String(), password: t.String() }) })

  .post("/logout", ({ cookie: { control_token } }) => {
    control_token.set({ value: "", maxAge: 0, path: "/" })
    return { success: true }
  })

  .get("/me", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    return { success: true, role: "control" }
  })

  // ── Vendor ────────────────────────────────────────────────
  .get("/vendor", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    return { success: true, vendor: await readJson<any>(VENDOR_FILE, {}) }
  })

  // ── Available sites ───────────────────────────────────────
  .get("/sites", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    try {
      const entries = await readdir(SITES_ROOT, { withFileTypes: true })
      const sites = entries.filter(e => e.isDirectory() && !e.name.startsWith("_")).map(e => e.name)
      return { success: true, sites }
    } catch { return { success: true, sites: [] } }
  })

  // ── List clients ──────────────────────────────────────────
  .get("/clients", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    await ensureClientsDir()
    try {
      const files = (await readdir(CLIENTS_DIR)).filter(f =>
        f.endsWith(".json") &&
        !f.endsWith("-invoices.json") &&
        !f.endsWith("-sites.json") &&
        !f.endsWith("-support.json")
      )
      const clients = await Promise.all(files.map(f => readJson<any>(join(CLIENTS_DIR, f), {})))
      return { success: true, clients: clients.filter(c => c.id) }
    } catch { return { success: true, clients: [] } }
  })

  // ── Create client ─────────────────────────────────────────
  .post("/clients", async ({ body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    await ensureClientsDir()
    const id = `client-${Date.now()}`
    const profile = { id, ...body, createdAt: new Date().toISOString() }
    await writeJson(profilePath(id), profile)
    await writeJson(sitesPath(id), [])
    await writeJson(invoicesPath(id), [])
    await writeJson(supportPath(id), [])
    return { success: true, client: profile }
  }, {
    body: t.Object({
      name:    t.String(),
      email:   t.Optional(t.String()),
      phone:   t.Optional(t.String()),
      address: t.Optional(t.String()),
      notes:   t.Optional(t.String()),
    })
  })

  // ── Get client (full) ─────────────────────────────────────
  .get("/clients/:id", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }
    const [sites, invoices, support] = await Promise.all([
      readJson<string[]>(sitesPath(params.id), []),
      readJson<any[]>(invoicesPath(params.id), []),
      readJson<any[]>(supportPath(params.id), []),
    ])
    return { success: true, client: { ...profile, sites, invoices, support } }
  })

  // ── Update client ─────────────────────────────────────────
  .put("/clients/:id", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }
    const updated = { ...profile, ...body, id: params.id }
    await writeJson(profilePath(params.id), updated)
    return { success: true, client: updated }
  }, {
    body: t.Object({
      name:    t.Optional(t.String()),
      email:   t.Optional(t.String()),
      phone:   t.Optional(t.String()),
      address: t.Optional(t.String()),
      notes:   t.Optional(t.String()),
    })
  })

  // ── Delete client ─────────────────────────────────────────
  .delete("/clients/:id", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    for (const f of [profilePath(params.id), sitesPath(params.id), invoicesPath(params.id), supportPath(params.id)]) {
      if (existsSync(f)) await rm(f)
    }
    return { success: true }
  })

  // ── Portal link ───────────────────────────────────────────
  .get("/clients/:id/portal-link", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const portalBase = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const token      = signClientToken(params.id)
    return { success: true, url: `${portalBase}/${params.id}?token=${token}` }
  })

  // ── Send portal access email ──────────────────────────────
  .post("/clients/:id/send-access-email", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile)       { set.status = 404; return { error: "Cliente não encontrado." } }
    if (!profile.email) { set.status = 400; return { error: "Cliente sem email cadastrado." } }
    const vendor     = await readJson<any>(VENDOR_FILE, {})
    const token      = signClientToken(params.id)
    const portalBase = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const link       = `${portalBase}/${params.id}?token=${token}`
    await sendPortalAccessEmail({ to: profile.email, clientName: profile.name, vendor, link })
    return { success: true }
  })

  // ── Sites ─────────────────────────────────────────────────
  .post("/clients/:id/sites", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const sites = await readJson<string[]>(sitesPath(params.id), [])
    if (!sites.includes(body.siteId)) sites.push(body.siteId)
    await writeJson(sitesPath(params.id), sites)
    return { success: true, sites }
  }, { body: t.Object({ siteId: t.String() }) })

  .delete("/clients/:id/sites/:siteId", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const sites = (await readJson<string[]>(sitesPath(params.id), [])).filter(s => s !== params.siteId)
    await writeJson(sitesPath(params.id), sites)
    return { success: true, sites }
  })

  // ── Invoices ──────────────────────────────────────────────
  .post("/clients/:id/invoices", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const invoices = await readJson<any[]>(invoicesPath(params.id), [])
    const invoice  = { id: `inv-${randomUUID().slice(0, 8)}`, ...body, createdAt: new Date().toISOString() }
    invoices.unshift(invoice)
    await writeJson(invoicesPath(params.id), invoices)
    return { success: true, invoice }
  }, {
    body: t.Object({
      description: t.String(),
      items:       t.Array(t.Object({ label: t.String(), amount: t.Number() })),
      total:       t.Number(),
      status:      invoiceStatusT,
      dueDate:     t.Optional(t.String()),
      paidAt:      t.Optional(t.String()),
    })
  })

  .put("/clients/:id/invoices/:invoiceId", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const invoices = await readJson<any[]>(invoicesPath(params.id), [])
    const idx = invoices.findIndex(i => i.id === params.invoiceId)
    if (idx === -1) { set.status = 404; return { error: "Fatura não encontrada." } }
    invoices[idx] = { ...invoices[idx], ...body }
    await writeJson(invoicesPath(params.id), invoices)
    return { success: true, invoice: invoices[idx] }
  }, {
    body: t.Object({
      description: t.Optional(t.String()),
      items:       t.Optional(t.Array(t.Object({ label: t.String(), amount: t.Number() }))),
      total:       t.Optional(t.Number()),
      status:      t.Optional(invoiceStatusT),
      dueDate:     t.Optional(t.String()),
      paidAt:      t.Optional(t.String()),
    })
  })

  .delete("/clients/:id/invoices/:invoiceId", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const invoices = (await readJson<any[]>(invoicesPath(params.id), [])).filter(i => i.id !== params.invoiceId)
    await writeJson(invoicesPath(params.id), invoices)
    return { success: true }
  })

  .post("/clients/:id/invoices/:invoiceId/send-email", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile)       { set.status = 404; return { error: "Cliente não encontrado." } }
    if (!profile.email) { set.status = 400; return { error: "Cliente sem email cadastrado." } }
    const invoices   = await readJson<any[]>(invoicesPath(params.id), [])
    const invoice    = invoices.find(i => i.id === params.invoiceId)
    if (!invoice) { set.status = 404; return { error: "Fatura não encontrada." } }
    const vendor     = await readJson<any>(VENDOR_FILE, {})
    const token      = signClientToken(params.id)
    const portalBase = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const portalLink = `${portalBase}/${params.id}?token=${token}`
    await sendInvoiceEmail({ to: profile.email, vendor, client: profile, invoice, portalLink })
    return { success: true }
  })

  .post("/clients/:id/invoices/:invoiceId/send-whatsapp", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile)       { set.status = 404; return { error: "Cliente não encontrado." } }
    if (!profile.phone) { set.status = 400; return { error: "Cliente sem telefone cadastrado." } }
    const invoices   = await readJson<any[]>(invoicesPath(params.id), [])
    const invoice    = invoices.find(i => i.id === params.invoiceId)
    if (!invoice) { set.status = 404; return { error: "Fatura não encontrada." } }
    const vendor     = await readJson<any>(VENDOR_FILE, {})
    const token      = signClientToken(params.id)
    const portalBase = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const link       = `${portalBase}/${params.id}?token=${token}`
    await sendInvoiceWhatsApp({ phone: profile.phone, vendor, client: profile, invoice, link })
    return { success: true }
  })

  // ── Support ───────────────────────────────────────────────
  .post("/clients/:id/support", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const tickets = await readJson<any[]>(supportPath(params.id), [])
    const ticket  = {
      id: `tkt-${randomUUID().slice(0, 8)}`,
      subject: body.subject,
      status: "open" as const,
      createdAt: new Date().toISOString(),
      messages: body.message ? [{ from: "admin", text: body.message, date: new Date().toISOString() }] : [],
    }
    tickets.unshift(ticket)
    await writeJson(supportPath(params.id), tickets)
    return { success: true, ticket }
  }, { body: t.Object({ subject: t.String(), message: t.Optional(t.String()) }) })

  .post("/clients/:id/support/:ticketId/reply", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const tickets = await readJson<any[]>(supportPath(params.id), [])
    const ticket  = tickets.find(t => t.id === params.ticketId)
    if (!ticket) { set.status = 404; return { error: "Ticket não encontrado." } }
    ticket.messages.push({ from: body.from || "admin", text: body.text, date: new Date().toISOString() })
    await writeJson(supportPath(params.id), tickets)
    return { success: true, ticket }
  }, {
    body: t.Object({
      text: t.String(),
      from: t.Optional(t.Union([t.Literal("admin"), t.Literal("client")])),
    })
  })

  .put("/clients/:id/support/:ticketId", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const tickets = await readJson<any[]>(supportPath(params.id), [])
    const idx     = tickets.findIndex(t => t.id === params.ticketId)
    if (idx === -1) { set.status = 404; return { error: "Ticket não encontrado." } }
    tickets[idx] = { ...tickets[idx], ...body }
    await writeJson(supportPath(params.id), tickets)
    return { success: true, ticket: tickets[idx] }
  }, {
    body: t.Object({
      status:  t.Optional(ticketStatusT),
      subject: t.Optional(t.String()),
    })
  })

  .delete("/clients/:id/support/:ticketId", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const tickets = (await readJson<any[]>(supportPath(params.id), [])).filter(t => t.id !== params.ticketId)
    await writeJson(supportPath(params.id), tickets)
    return { success: true }
  })
