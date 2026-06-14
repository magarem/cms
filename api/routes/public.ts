import { Elysia, t } from "elysia"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { verifyInvoiceToken, verifyClientToken } from "../lib/invoice-token"

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
