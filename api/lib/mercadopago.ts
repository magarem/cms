const MP_TOKEN = process.env.MERCADOPAGO_TOKEN || ""
const MP_BASE  = "https://api.mercadopago.com"

export async function createPaymentLink(opts: {
  referenceId: string
  name: string
  amountBRL: number
  dueDate?: string
  notificationUrl: string
}): Promise<{ id: string; url: string }> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_TOKEN não configurado.")

  const expiresAt = opts.dueDate
    ? new Date(opts.dueDate + "T23:59:59-03:00").toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MP_TOKEN}`,
    },
    body: JSON.stringify({
      items: [{
        id:         opts.referenceId,
        title:      opts.name,
        quantity:   1,
        unit_price: opts.amountBRL,
        currency_id: "BRL",
      }],
      external_reference: opts.referenceId,
      notification_url:   opts.notificationUrl,
      expires:            true,
      expiration_date_to: expiresAt,
    }),
  })

  const raw = await res.text()
  console.log(`[mercadopago] status=${res.status} body=${raw.slice(0, 300)}`)

  let data: any
  try { data = JSON.parse(raw) } catch {
    throw new Error(`MercadoPago ${res.status}: resposta não-JSON — ${raw.slice(0, 200)}`)
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || JSON.stringify(data)
    throw new Error(`MercadoPago ${res.status}: ${msg}`)
  }

  const url = data.init_point
  if (!url) throw new Error("MercadoPago não retornou URL de pagamento.")

  return { id: data.id as string, url }
}

export async function getPaymentStatus(paymentId: string): Promise<{ externalReference: string; isPaid: boolean }> {
  const res  = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${MP_TOKEN}` },
  })
  const data = await res.json() as any
  return {
    externalReference: data.external_reference || "",
    isPaid: data.status === "approved",
  }
}
