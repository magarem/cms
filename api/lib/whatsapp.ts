const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID  || ""
const ZAPI_TOKEN    = process.env.ZAPI_TOKEN         || ""
const ZAPI_CLIENT   = process.env.ZAPI_CLIENT_TOKEN  || ""

function baseUrl() {
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`
}

function sanitizePhone(phone: string) {
  // Keep digits only; Z-API expects full international number e.g. 5511999999999
  return phone.replace(/\D/g, "")
}

async function zapiPost(path: string, body: object) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) throw new Error("ZAPI_INSTANCE_ID / ZAPI_TOKEN não configurados.")
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json() as any
  if (!res.ok) throw new Error(`Z-API error ${res.status}: ${json?.message || JSON.stringify(json)}`)
  return json
}

export async function sendInvoiceWhatsApp(opts: {
  phone: string
  vendor: { name?: string }
  client: { name: string }
  invoice: {
    id: string
    description: string
    total: number
    dueDate?: string
  }
  link?: string
}) {
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
  const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""

  const vendorName = opts.vendor.name || "Sua fatura"

  const lines = [
    `Olá, *${opts.client.name}*! 👋`,
    ``,
    `Você recebeu uma fatura de *${vendorName}*.`,
    ``,
    `📋 ${opts.invoice.description}`,
    `💰 *${fmt(opts.invoice.total)}*`,
    opts.invoice.dueDate ? `📅 Vencimento: ${fmtD(opts.invoice.dueDate)}` : "",
    ``,
    opts.link
      ? `👉 Ver fatura: ${opts.link}`
      : `_Ref: #${opts.invoice.id}_`,
  ].filter(l => l !== undefined && l !== null).join("\n")

  await zapiPost("/send-text", {
    phone:   sanitizePhone(opts.phone),
    message: lines,
  })
}

export async function getZapiStatus() {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) throw new Error("ZAPI_INSTANCE_ID / ZAPI_TOKEN não configurados.")
  const res = await fetch(`${baseUrl()}/status`, {
    headers: { "Client-Token": ZAPI_CLIENT },
  })
  return res.json()
}
