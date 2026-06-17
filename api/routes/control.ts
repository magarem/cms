import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { SITES_ROOT, getSiteSettings, getActiveVersion, buildTree, resolvePageFile, writePage } from "../lib/content"
import { JWT_SECRET } from "../lib/config"
import { randomUUID } from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import { sendInvoiceEmail, sendPortalAccessEmail, sendTemplateEmail } from "../lib/email"
import { sendInvoiceWhatsApp } from "../lib/whatsapp"
import { signClientToken } from "../lib/invoice-token"
import { createPaymentLink, getPaymentStatus } from "../lib/mercadopago"

const SIRIUS_DIR        = join(SITES_ROOT, "_sirius")
const CLIENTS_DIR       = join(SIRIUS_DIR, "clients")
const VENDOR_FILE       = join(SIRIUS_DIR, "vendor.json")
const PRODUCTS_FILE     = join(SIRIUS_DIR, "products.json")
const EMAIL_TEMPLATES_FILE = join(SIRIUS_DIR, "email-templates.json")

const TEMPLATE_DEFAULTS: Record<string, { name: string; subject: string; body: string; vars: string[] }> = {
  new_invoice: {
    name:    "Nova fatura",
    subject: "Nova fatura — {{invoiceDescription}}",
    body:    `Olá {{clientName}},\n\nFoi emitida uma nova fatura em seu nome.\n\nFatura: #{{invoiceId}}\nDescrição: {{invoiceDescription}}\nValor: {{total}}\nVencimento: {{dueDate}}\n\nAceda ao seu portal para ver os detalhes e efectuar o pagamento:\n{{portalLink}}\n\nObrigado pela sua confiança.`,
    vars:    ["clientName", "vendorName", "invoiceId", "invoiceDescription", "total", "dueDate", "portalLink"],
  },
  late_payment: {
    name:    "Pagamento em atraso",
    subject: "Lembrete: fatura #{{invoiceId}} por pagar",
    body:    `Olá {{clientName}},\n\nGostaríamos de lembrar que a fatura #{{invoiceId}} no valor de {{total}} está por pagar e encontra-se vencida desde {{dueDate}}.\n\nPor favor proceda ao pagamento o mais breve possível para evitar interrupções no serviço:\n{{portalLink}}\n\nEm caso de dúvida, não hesite em contactar-nos.`,
    vars:    ["clientName", "vendorName", "invoiceId", "total", "dueDate", "portalLink"],
  },
  last_warning: {
    name:    "Último aviso — Suspensão iminente",
    subject: "⚠️ Último aviso: suspensão iminente do seu site",
    body:    `Olá {{clientName}},\n\nEste é um aviso urgente: o seu site será suspenso nas próximas 48 horas caso os pagamentos em atraso não sejam regularizados.\n\nPor favor aceda ao seu portal e proceda ao pagamento imediatamente:\n{{portalLink}}\n\nSe já efectuou o pagamento, por favor ignore esta mensagem.`,
    vars:    ["clientName", "vendorName", "portalLink"],
  },
  site_suspended: {
    name:    "Site suspenso",
    subject: "O seu site foi suspenso",
    body:    `Olá {{clientName}},\n\nInformamos que o seu site foi temporariamente suspenso devido a pagamentos em atraso.\n\nPara reactivar o seu site, regularize os pagamentos pendentes através do seu portal:\n{{portalLink}}\n\nReactivaremos o seu site no prazo de 24 horas após confirmação do pagamento.`,
    vars:    ["clientName", "vendorName", "portalLink"],
  },
  site_reactivated: {
    name:    "Site reactivado",
    subject: "✅ O seu site foi reactivado",
    body:    `Olá {{clientName}},\n\nTemos o prazer de informar que o seu site foi reactivado após regularização do pagamento.\n\nObrigado por resolver a situação. Continuamos ao seu dispor para qualquer questão.\n\nBom trabalho!`,
    vars:    ["clientName", "vendorName", "portalLink"],
  },
  portal_access: {
    name:    "Acesso à sua área",
    subject: "Acesso à sua área de cliente",
    body:    `Olá {{clientName}},\n\nClique no botão abaixo para aceder à sua área de cliente e consultar as suas faturas.\n\n{{link}}\n\nO link é permanente — guarde-o para futuras consultas.\n\nSe não solicitou este acesso, pode ignorar este email.`,
    vars:    ["clientName", "vendorName", "link"],
  },
}

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

type SiteEntry = { id: string; name?: string; url?: string }
function normalizeSites(raw: any[]): SiteEntry[] {
  return raw.map(s => typeof s === "string" ? { id: s } : s)
}

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
      const sites   = await Promise.all(
        entries
          .filter(e => e.isDirectory() && !e.name.startsWith("_"))
          .map(async e => {
            const siteSettings = await readJson<any>(join(SITES_ROOT, e.name, "_settings.json"), {})
            return {
              id:  e.name,
              url: siteSettings.siteUrl || `https://${e.name}.siriusstudio.site`,
              title: siteSettings.siteTitle || e.name,
            }
          })
      )
      return { success: true, sites }
    } catch { return { success: true, sites: [] } }
  })

  // ── Create site (scaffold + optional AI generation) ───────
  .post("/sites/create", async ({ body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }

    const { siteId, siteName, description } = body as { siteId: string; siteName?: string; description?: string }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(siteId) || siteId.length < 2) {
      set.status = 400; return { error: "ID inválido. Use apenas letras minúsculas, números e hífens." }
    }

    const siteDir = join(SITES_ROOT, siteId)
    if (existsSync(siteDir)) { set.status = 409; return { error: "Já existe um site com esse ID." } }

    // ── Scaffold ──────────────────────────────────────────
    await mkdir(join(siteDir, "v1"), { recursive: true })
    await writeJson(join(siteDir, "_settings.json"), {
      activeEditionVersion: "v1",
      siteVersions:         ["v1"],
      siteUrl:              `https://${siteId}.siriusstudio.site`,
      ...(siteName ? { siteTitle: siteName } : {}),
    })
    await writeJson(join(siteDir, "users.json"), { users: [] })
    await writeFile(join(siteDir, "v1", "_order.yml"), "order: []\n", "utf-8")

    if (!description?.trim()) return { success: true, site: siteId, generated: false }

    // ── AI generation ─────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { success: true, site: siteId, generated: false, warning: "ANTHROPIC_API_KEY não configurada." }

    const registryPath = join(import.meta.dir, "..", "ui", "app", "data", "components.json")
    if (!existsSync(registryPath)) return { success: true, site: siteId, generated: false, warning: "Registo de componentes não encontrado." }

    try {
      const registry   = JSON.parse(await readFile(registryPath, "utf-8"))
      const settings   = await getSiteSettings(siteId)
      const version    = getActiveVersion(settings)
      const tree       = await buildTree(siteId, version)

      const SYSTEM_PROMPT = `You are an expert web designer and CMS content architect for the Sirius CMS platform.
Your job: given a description of a website, produce a complete page structure with blocks and realistic content.
Rules:
- Only use components from the registry provided. Never invent component names.
- Generate realistic, specific content — no "Lorem ipsum", no placeholders.
- All text content should match the language/locale of the site description.
- The home page must use path "" (empty string).
- Slugs: lowercase, hyphens only.
- Blocks appear in visual order top-to-bottom on the page.
- You MUST call the submit_spec tool with the complete spec.`

      const componentSummary = (registry.components || [])
        .filter((c: any) => !c.cms_hidden)
        .map((c: any) => {
          const props = (c.props || []).map((p: any) => {
            let desc = `  - ${p.name} (${p.type})`
            if (p.required) desc += " [required]"
            if (p.options)  desc += ` options: [${p.options.map((o: any) => o.value).join(", ")}]`
            return desc
          }).join("\n")
          return `### ${c.name}\n${c.description}\nProps:\n${props}`
        }).join("\n\n")

      const userMessage = `Site name: ${siteName || siteId}\nSite is empty — create all pages from scratch.\n\n## Available Components\n${componentSummary}\n\n## User Request\n${description}`

      const submitSpecTool: Anthropic.Tool = {
        name: "submit_spec",
        description: "Submit the complete site spec.",
        input_schema: {
          type: "object" as const,
          properties: {
            pages: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "title", "blocks"],
                properties: {
                  path: { type: "string" }, title: { type: "string" }, overwrite: { type: "boolean" },
                  data: { type: "object" },
                  blocks: { type: "array", items: { type: "object", properties: { componentName: { type: "string" }, isHero: { type: "boolean" }, props: { type: "object" } } } },
                  markdown: { type: "string" },
                },
              },
            },
          },
          required: ["pages"],
        },
      }

      const anthropic  = new Anthropic({ apiKey })
      const response   = await anthropic.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: 8192,
        system:     SYSTEM_PROMPT,
        tools:      [submitSpecTool],
        tool_choice: { type: "any" },
        messages:   [{ role: "user", content: userMessage }],
      })

      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      if (!toolUse) return { success: true, site: siteId, generated: false, warning: "Modelo não devolveu spec." }

      const spec = toolUse.input as { pages: any[] }

      const results: { path: string; status: string }[] = []
      for (const page of spec.pages) {
        const pagePath = String(page.path ?? "").replace(/^\/+|\/+$/g, "")
        try {
          const blocks = (page.blocks || []).map((b: any, i: number) => ({
            id: `${String(b.componentName).toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36)}-${i}`,
            componentName: b.componentName, isHero: b.isHero ?? false, props: b.props ?? {},
          }))
          const pageData: any = { ...(page.data ?? {}), title: page.title, layout: page.data?.layout ?? "default", blocks }
          await writePage(siteId, version, pagePath, pageData)
          if (page.markdown != null) {
            const dirPath = join(SITES_ROOT, siteId, version, pagePath)
            await mkdir(dirPath, { recursive: true })
            await writeFile(join(dirPath, "content.md"), page.markdown, "utf-8")
          }
          results.push({ path: pagePath || "/", status: "created" })
        } catch (err: any) {
          results.push({ path: pagePath || "/", status: "error" })
        }
      }

      return { success: true, site: siteId, generated: true, pages: results.length }
    } catch (err: any) {
      return { success: true, site: siteId, generated: false, warning: `Erro na geração AI: ${err.message}` }
    }
  }, {
    body: t.Object({
      siteId:      t.String(),
      siteName:    t.Optional(t.String()),
      description: t.Optional(t.String()),
    }),
  })

  // ── Products / Services ───────────────────────────────────
  .get("/products", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const products = await readJson<any[]>(PRODUCTS_FILE, [])
    return { success: true, products }
  })

  .post("/products", async ({ body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    await mkdir(SIRIUS_DIR, { recursive: true })
    const products = await readJson<any[]>(PRODUCTS_FILE, [])
    const product = { id: `prod-${randomUUID().slice(0, 8)}`, ...body, active: true, createdAt: new Date().toISOString() }
    products.push(product)
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2))
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

  .put("/products/:id", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const products = await readJson<any[]>(PRODUCTS_FILE, [])
    const idx = products.findIndex(p => p.id === params.id)
    if (idx === -1) { set.status = 404; return { error: "Produto não encontrado." } }
    products[idx] = { ...products[idx], ...body }
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2))
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

  .delete("/products/:id", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const products = (await readJson<any[]>(PRODUCTS_FILE, [])).filter(p => p.id !== params.id)
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2))
    return { success: true }
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
      const profiles = await Promise.all(files.map(f => readJson<any>(join(CLIENTS_DIR, f), {})))
      const clients = await Promise.all(
        profiles.filter(c => c.id).map(async c => {
          const tickets = await readJson<any[]>(supportPath(c.id), [])
          return { ...c, openTickets: tickets.filter((t: any) => t.status === "open").length }
        })
      )
      return { success: true, clients }
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
    const [rawSites, invoices, support] = await Promise.all([
      readJson<any[]>(sitesPath(params.id), []),
      readJson<any[]>(invoicesPath(params.id), []),
      readJson<any[]>(supportPath(params.id), []),
    ])
    return { success: true, client: { ...profile, sites: normalizeSites(rawSites), invoices, support } }
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
    const sites = normalizeSites(await readJson<any[]>(sitesPath(params.id), []))
    if (!sites.find(s => s.id === body.siteId)) {
      sites.push({ id: body.siteId, name: body.name || undefined, url: body.url || `https://${body.siteId}.siriusstudio.site` })
    }
    await writeJson(sitesPath(params.id), sites)
    return { success: true, sites }
  }, { body: t.Object({ siteId: t.String(), name: t.Optional(t.Union([t.String(), t.Null()])), url: t.Optional(t.Union([t.String(), t.Null()])) }) })

  .patch("/clients/:id/sites/:siteId", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const sites = normalizeSites(await readJson<any[]>(sitesPath(params.id), []))
    const entry = sites.find(s => s.id === params.siteId)
    if (!entry) { set.status = 404; return { error: "Site não encontrado." } }
    if (body.name !== undefined) entry.name = body.name || undefined
    if (body.url  !== undefined) entry.url  = body.url  || undefined
    await writeJson(sitesPath(params.id), sites)
    return { success: true, sites }
  }, { body: t.Object({ name: t.Optional(t.Union([t.String(), t.Null()])), url: t.Optional(t.Union([t.String(), t.Null()])) }) })

  .delete("/clients/:id/sites/:siteId", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const sites = normalizeSites(await readJson<any[]>(sitesPath(params.id), [])).filter(s => s.id !== params.siteId)
    await writeJson(sitesPath(params.id), sites)
    return { success: true, sites }
  })

  // ── Invoices ──────────────────────────────────────────────
  .post("/clients/:id/invoices", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const invoices = await readJson<any[]>(invoicesPath(params.id), [])
    const invoice: any = { id: `inv-${randomUUID().slice(0, 8)}`, ...body, createdAt: new Date().toISOString() }

    if (invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.total > 0) {
      const apiBase = (process.env.CONTROL_URL || "https://cms.siriusstudio.site").replace(/\/$/, "")
      try {
        const { id: mpId, url: paymentUrl } = await createPaymentLink({
          referenceId:     `${params.id}|${invoice.id}`,
          name:            invoice.description,
          amountBRL:       invoice.total,
          dueDate:         invoice.dueDate,
          notificationUrl: `${apiBase}/control/webhooks/mercadopago`,
        })
        invoice.mpId       = mpId
        invoice.paymentUrl = paymentUrl
      } catch (e: any) {
        console.error("[mercadopago] auto-link failed:", e.message)
      }
    }

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

  // ── Generate Mercado Pago payment link ───────────────────
  .post("/clients/:id/invoices/:invoiceId/generate-payment-link", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const profile  = await readJson<any>(profilePath(params.id), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }
    const invoices = await readJson<any[]>(invoicesPath(params.id), [])
    const idx      = invoices.findIndex(i => i.id === params.invoiceId)
    if (idx === -1) { set.status = 404; return { error: "Fatura não encontrada." } }
    const invoice  = invoices[idx]
    const apiBase  = (process.env.CONTROL_URL || "https://cms.siriusstudio.site").replace(/\/$/, "")
    try {
      const { id: mpId, url: paymentUrl } = await createPaymentLink({
        referenceId:     `${params.id}|${params.invoiceId}`,
        name:            invoice.description,
        amountBRL:       invoice.total,
        dueDate:         invoice.dueDate,
        notificationUrl: `${apiBase}/control/webhooks/mercadopago`,
      })
      invoices[idx] = { ...invoice, mpId, paymentUrl }
      await writeJson(invoicesPath(params.id), invoices)
      return { success: true, invoice: invoices[idx], paymentUrl }
    } catch (e: any) {
      set.status = 502
      return { error: e.message || "Erro ao comunicar com Mercado Pago." }
    }
  })

  // ── Mercado Pago webhook (public, no auth) ────────────────
  .post("/webhooks/mercadopago", async ({ body }: { body: any }) => {
    try {
      const paymentId: string = body?.data?.id || ""
      if (!paymentId || body?.type !== "payment") return { received: true }
      const { externalReference, isPaid } = await getPaymentStatus(paymentId)
      if (!isPaid || !externalReference.includes("|")) return { received: true }
      const [clientId, invoiceId] = externalReference.split("|")
      const invoices = await readJson<any[]>(invoicesPath(clientId), [])
      const paidAt   = new Date().toISOString()
      if (invoiceId === "bulk") {
        const updated = invoices.map(i =>
          (i.status === "pending" || i.status === "overdue") ? { ...i, status: "paid", paidAt } : i
        )
        await writeJson(invoicesPath(clientId), updated)
        console.log(`[mercadopago] all pending invoices for ${clientId} marked paid via bulk webhook`)
      } else {
        const idx = invoices.findIndex(i => i.id === invoiceId)
        if (idx === -1) return { received: true }
        invoices[idx] = { ...invoices[idx], status: "paid", paidAt }
        await writeJson(invoicesPath(clientId), invoices)
        console.log(`[mercadopago] invoice ${invoiceId} marked paid via webhook`)
      }
    } catch (e) {
      console.error("[mercadopago] webhook error", e)
    }
    return { received: true }
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

  // ── Email templates ───────────────────────────────────────
  .get("/email-templates", async ({ cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const saved = await readJson<Record<string, any>>(EMAIL_TEMPLATES_FILE, {})
    const templates = Object.entries(TEMPLATE_DEFAULTS).map(([key, def]) => ({
      key,
      name:    def.name,
      subject: saved[key]?.subject ?? def.subject,
      body:    saved[key]?.body    ?? def.body,
      vars:    def.vars,
      isCustom: !!saved[key],
    }))
    return { success: true, templates }
  })

  .put("/email-templates/:key", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    if (!TEMPLATE_DEFAULTS[params.key]) { set.status = 404; return { error: "Template não encontrado." } }
    const saved = await readJson<Record<string, any>>(EMAIL_TEMPLATES_FILE, {})
    saved[params.key] = { subject: (body as any).subject, body: (body as any).body }
    await writeJson(EMAIL_TEMPLATES_FILE, saved)
    return { success: true }
  }, {
    params: t.Object({ key: t.String() }),
    body:   t.Object({ subject: t.String(), body: t.String() }),
  })

  .delete("/email-templates/:key", async ({ params, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }
    const saved = await readJson<Record<string, any>>(EMAIL_TEMPLATES_FILE, {})
    delete saved[params.key]
    await writeJson(EMAIL_TEMPLATES_FILE, saved)
    return { success: true }
  }, {
    params: t.Object({ key: t.String() }),
  })

  // ── Send template email to client ─────────────────────────
  .post("/clients/:id/send-template-email", async ({ params, body, cookie: { control_token }, jwt, set }) => {
    if (!await requireControl(jwt, control_token?.value, set)) return { error: "Sem acesso." }

    const { templateKey, invoiceId } = body as { templateKey: string; invoiceId?: string }
    if (!TEMPLATE_DEFAULTS[templateKey]) { set.status = 400; return { error: "Template inválido." } }

    const profile = await readJson<any>(profilePath(params.id), null)
    if (!profile?.email) { set.status = 400; return { error: "Cliente sem email." } }

    const vendor   = await readJson<any>(VENDOR_FILE, {})
    const saved    = await readJson<Record<string, any>>(EMAIL_TEMPLATES_FILE, {})
    const def      = TEMPLATE_DEFAULTS[templateKey]
    const subject  = saved[templateKey]?.subject ?? def.subject
    const bodyTpl  = saved[templateKey]?.body    ?? def.body

    const portalUrl = (process.env.PORTAL_URL || "https://my.siriusstudio.site").replace(/\/$/, "")
    const token     = (await import("../lib/invoice-token")).signClientToken(params.id)

    const fmt = (n: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
    const fmtDate = (iso?: string) =>
      iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—"

    const vars: Record<string, string> = {
      clientName:  profile.name || "",
      vendorName:  vendor.name  || "",
      portalLink:  `${portalUrl}/${params.id}?token=${token}`,
    }

    if (invoiceId) {
      const invoices = await readJson<any[]>(invoicesPath(params.id), [])
      const inv = invoices.find((i: any) => i.id === invoiceId)
      if (inv) {
        vars.invoiceId          = inv.id
        vars.invoiceDescription = inv.description || ""
        vars.total              = fmt(inv.total || 0)
        vars.dueDate            = fmtDate(inv.dueDate)
      }
    }

    try {
      await sendTemplateEmail({ to: profile.email, subject, body: bodyTpl, vendor, vars })
      return { success: true }
    } catch (e: any) {
      set.status = 502
      return { error: e.message || "Erro ao enviar email." }
    }
  }, {
    params: t.Object({ id: t.String() }),
    body:   t.Object({
      templateKey: t.String(),
      invoiceId:   t.Optional(t.String()),
    }),
  })
