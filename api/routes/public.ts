import { Elysia, t } from "elysia"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { verifyInvoiceToken, verifyClientToken, signClientToken, signCmsMagicToken } from "../lib/invoice-token"
import { sendPortalAccessEmail } from "../lib/email"
import { createPaymentLink } from "../lib/mercadopago"
import { readUsers, writeUsers, hashPassword } from "../lib/users"

const CLIENTS_DIR = join(SITES_ROOT, "_sirius", "clients")
const VENDOR_FILE  = join(SITES_ROOT, "_sirius", "vendor.json")

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf-8")) as T } catch { return fallback }
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2))
}

export const publicRoutes = new Elysia({ prefix: "/public" })
  // Single invoice view — accepts invoice token OR client token
  .get("/invoice/:clientId/:invoiceId", async ({ params, query, set }) => {
    const { clientId, invoiceId } = params
    const token = (query as any).token as string | undefined

    const valid = token && (
      verifyInvoiceToken(clientId, invoiceId, token) ||
      verifyClientToken(clientId, token)
    )
    if (!valid) { set.status = 403; return { error: "Token inválido ou expirado." } }

    const profile  = await readJson<any>(join(CLIENTS_DIR, `${clientId}.json`), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }

    const invoices = await readJson<any[]>(join(CLIENTS_DIR, `${clientId}-invoices.json`), [])
    const invoice  = invoices.find((i: any) => i.id === invoiceId)
    if (!invoice) { set.status = 404; return { error: "Fatura não encontrada." } }

    const vendor = await readJson<any>(VENDOR_FILE, {})

    return { success: true, client: { name: profile.name }, invoice, vendor }
  }, {
    params: t.Object({ clientId: t.String(), invoiceId: t.String() }),
  })

  // Magic link login — client requests access by email
  .post("/portal/request-access", async ({ body, set }) => {
    const { email } = body as { email: string }
    if (!email) { set.status = 400; return { error: "Email obrigatório." } }

    let matchedClient: any = null
    try {
      const files = (await readdir(CLIENTS_DIR)).filter(f =>
        f.endsWith(".json") && !f.endsWith("-invoices.json") && !f.endsWith("-support.json") && !f.endsWith("-sites.json")
      )
      for (const file of files) {
        const profile = await readJson<any>(join(CLIENTS_DIR, file), null)
        if (profile?.email?.toLowerCase() === email.toLowerCase()) {
          matchedClient = profile
          break
        }
      }
    } catch { /* clients dir may not exist yet */ }

    if (!matchedClient) return { success: true }

    const vendor    = await readJson<any>(VENDOR_FILE, {})
    const token     = signClientToken(matchedClient.id)
    const portalUrl = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const link      = `${portalUrl}/${matchedClient.id}?token=${token}`

    try {
      await sendPortalAccessEmail({ to: email, clientName: matchedClient.name, vendor, link })
    } catch (e: any) {
      console.error("[portal] email error:", e.message)
    }

    return { success: true }
  }, {
    body: t.Object({ email: t.String() }),
  })

  // Client portal — all data for a client
  .get("/client/:clientId", async ({ params, query, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido. Solicite um novo link ao seu fornecedor." }
    }

    const profile  = await readJson<any>(join(CLIENTS_DIR, `${clientId}.json`), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }

    const [invoices, rawSites] = await Promise.all([
      readJson<any[]>(join(CLIENTS_DIR, `${clientId}-invoices.json`), []),
      readJson<any[]>(join(CLIENTS_DIR, `${clientId}-sites.json`), []),
    ])
    const cmsUrl = (process.env.CMS_UI_URL || "http://localhost:3001").replace(/\/$/, "")
    const sites  = await Promise.all(
      rawSites
        .map((s: any) => typeof s === "string" ? { id: s } : s)
        .map(async (s: any) => {
          if (!s.url) {
            const siteSettings = await readJson<any>(join(SITES_ROOT, s.id, "_settings.json"), {})
            if (siteSettings.siteUrl) s = { ...s, url: siteSettings.siteUrl }
          }
          return { ...s, cmsToken: signCmsMagicToken(clientId, s.id), cmsUrl }
        })
    )
    const vendor = await readJson<any>(VENDOR_FILE, {})

    return {
      success:  true,
      client:   { name: profile.name, email: profile.email, phone: profile.phone, address: profile.address },
      invoices,
      sites,
      vendor,
    }
  }, {
    params: t.Object({ clientId: t.String() }),
  })

  // Update client profile (name, phone, address)
  .put("/client/:clientId/profile", async ({ params, query, body, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const profilePath = join(CLIENTS_DIR, `${clientId}.json`)
    const profile = await readJson<any>(profilePath, null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }

    const { name, phone, address } = body as { name?: string; phone?: string; address?: string }
    if (name?.trim())     profile.name    = name.trim()
    if (phone !== undefined)   profile.phone   = phone.trim()
    if (address !== undefined) profile.address = address.trim()

    await writeJson(profilePath, profile)

    return { success: true, client: { name: profile.name, email: profile.email, phone: profile.phone, address: profile.address } }
  }, {
    params: t.Object({ clientId: t.String() }),
    body:   t.Object({
      name:    t.Optional(t.String()),
      phone:   t.Optional(t.String()),
      address: t.Optional(t.String()),
    }),
  })

  // Support — list tickets
  .get("/client/:clientId/support", async ({ params, query, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const tickets = await readJson<any[]>(join(CLIENTS_DIR, `${clientId}-support.json`), [])
    return { success: true, tickets }
  }, {
    params: t.Object({ clientId: t.String() }),
  })

  // Support — create ticket
  .post("/client/:clientId/support", async ({ params, query, body, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const { subject, message } = body as { subject: string; message?: string }

    const supportPath = join(CLIENTS_DIR, `${clientId}-support.json`)
    const tickets = await readJson<any[]>(supportPath, [])

    const ticket: any = {
      id:        `tkt-${Math.random().toString(16).slice(2, 10)}`,
      subject:   subject.trim(),
      status:    "open",
      createdAt: new Date().toISOString(),
      messages:  message?.trim()
        ? [{ from: "client", text: message.trim(), date: new Date().toISOString() }]
        : [],
    }

    tickets.unshift(ticket)
    await writeJson(supportPath, tickets)

    return { success: true, ticket }
  }, {
    params: t.Object({ clientId: t.String() }),
    body:   t.Object({
      subject: t.String(),
      message: t.Optional(t.String()),
    }),
  })

  // Support — reply to ticket
  .post("/client/:clientId/support/:ticketId/reply", async ({ params, query, body, set }) => {
    const { clientId, ticketId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const { text } = body as { text: string }

    const supportPath = join(CLIENTS_DIR, `${clientId}-support.json`)
    const tickets = await readJson<any[]>(supportPath, [])
    const ticket  = tickets.find((t: any) => t.id === ticketId)
    if (!ticket) { set.status = 404; return { error: "Ticket não encontrado." } }

    ticket.messages.push({ from: "client", text: text.trim(), date: new Date().toISOString() })
    await writeJson(supportPath, tickets)

    return { success: true }
  }, {
    params: t.Object({ clientId: t.String(), ticketId: t.String() }),
    body:   t.Object({ text: t.String() }),
  })

  // Bulk payment link — sum of all pending+overdue invoices
  .post("/client/:clientId/bulk-payment-link", async ({ params, query, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const invoices = await readJson<any[]>(join(CLIENTS_DIR, `${clientId}-invoices.json`), [])
    const due = invoices.filter(i => i.status === "pending" || i.status === "overdue")
    if (!due.length) { set.status = 400; return { error: "Sem faturas em aberto." } }

    const total   = due.reduce((s, i) => s + (i.total || 0), 0)
    const apiBase = (process.env.CONTROL_URL || "https://cms.siriusstudio.site").replace(/\/$/, "")

    try {
      const { url: paymentUrl } = await createPaymentLink({
        referenceId:     `${clientId}|bulk`,
        name:            `Pagamento total — ${due.length} fatura(s)`,
        amountBRL:       total,
        notificationUrl: `${apiBase}/control/webhooks/mercadopago`,
      })
      return { success: true, paymentUrl, total }
    } catch (e: any) {
      set.status = 502
      return { error: e.message || "Erro ao gerar link de pagamento." }
    }
  }, {
    params: t.Object({ clientId: t.String() }),
  })

  // Set CMS password — creates/updates the client's editor account on each assigned site
  .put("/client/:clientId/cms-password", async ({ params, query, body, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido." }
    }

    const { password } = body as { password: string }

    const profile  = await readJson<any>(join(CLIENTS_DIR, `${clientId}.json`), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }

    const rawSites = await readJson<any[]>(join(CLIENTS_DIR, `${clientId}-sites.json`), [])
    const sites    = rawSites.map((s: any) => typeof s === "string" ? { id: s } : s)
    if (!sites.length) { set.status = 400; return { error: "Sem sites associados." } }

    const username     = profile.email || `cliente-${clientId}`
    const passwordHash = await hashPassword(password)
    const cmsUrl       = (process.env.CMS_UI_URL || "http://localhost:3001").replace(/\/$/, "")

    for (const site of sites) {
      const { users } = await readUsers(site.id)
      const idx = users.findIndex((u: any) => u.id === clientId || u.username === username)
      if (idx >= 0) {
        users[idx] = { ...users[idx], id: clientId, username, passwordHash, role: "editor", sites: [site.id], email: profile.email }
      } else {
        users.push({ id: clientId, username, passwordHash, role: "editor", sites: [site.id], email: profile.email })
      }
      await writeUsers(site.id, { users })
    }

    return { success: true, username, cmsUrl, sites: sites.map((s: any) => s.id) }
  }, {
    params: t.Object({ clientId: t.String() }),
    body:   t.Object({ password: t.String({ minLength: 6 }) }),
  })

