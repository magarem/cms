import { Elysia, t } from "elysia"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { verifyInvoiceToken, verifyClientToken, signClientToken } from "../lib/invoice-token"
import { sendPortalAccessEmail } from "../lib/email"

const CLIENTS_DIR = join(SITES_ROOT, "_sirius", "clients")
const VENDOR_FILE  = join(SITES_ROOT, "_sirius", "vendor.json")

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf-8")) as T } catch { return fallback }
}

export const publicRoutes = new Elysia({ prefix: "/public" })
  // Single invoice view (kept for back-compat with old links)
  .get("/invoice/:clientId/:invoiceId", async ({ params, query, set }) => {
    const { clientId, invoiceId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyInvoiceToken(clientId, invoiceId, token)) {
      set.status = 403
      return { error: "Token inválido ou expirado." }
    }

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

    // Search all client profiles for matching email (case-insensitive)
    let matchedClient: any = null
    try {
      const files = (await readdir(CLIENTS_DIR)).filter(f => f.endsWith(".json") && !f.includes("-"))
      for (const file of files) {
        const profile = await readJson<any>(join(CLIENTS_DIR, file), null)
        if (profile?.email?.toLowerCase() === email.toLowerCase()) {
          matchedClient = profile
          break
        }
      }
    } catch { /* clients dir may not exist yet */ }

    // Always return success to prevent email enumeration
    if (!matchedClient) return { success: true }

    const vendor   = await readJson<any>(VENDOR_FILE, {})
    const token    = signClientToken(matchedClient.id)
    const portalUrl = (process.env.PORTAL_URL || "http://localhost:3003").replace(/\/$/, "")
    const link     = `${portalUrl}/${matchedClient.id}?token=${token}`

    try {
      await sendPortalAccessEmail({ to: email, clientName: matchedClient.name, vendor, link })
    } catch (e: any) {
      console.error("[portal] email error:", e.message)
    }

    return { success: true }
  }, {
    body: t.Object({ email: t.String() }),
  })

  // Client portal — all invoices for a client (stable token per client)
  .get("/client/:clientId", async ({ params, query, set }) => {
    const { clientId } = params
    const token = (query as any).token as string | undefined

    if (!token || !verifyClientToken(clientId, token)) {
      set.status = 403
      return { error: "Link inválido. Solicite um novo link ao seu fornecedor." }
    }

    const profile  = await readJson<any>(join(CLIENTS_DIR, `${clientId}.json`), null)
    if (!profile) { set.status = 404; return { error: "Cliente não encontrado." } }

    const invoices = await readJson<any[]>(join(CLIENTS_DIR, `${clientId}-invoices.json`), [])
    const vendor   = await readJson<any>(VENDOR_FILE, {})

    return {
      success: true,
      client:  { name: profile.name, email: profile.email, phone: profile.phone },
      invoices,
      vendor,
    }
  }, {
    params: t.Object({ clientId: t.String() }),
  })
