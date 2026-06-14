const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN || ""
const PAGBANK_BASE  = "https://api.pagseguro.com"

export async function createPaymentLink(opts: {
  referenceId: string
  name: string
  amountBRL: number
  dueDate?: string
  notificationUrl: string
}): Promise<{ id: string; url: string }> {
  if (!PAGBANK_TOKEN) throw new Error("PAGBANK_TOKEN não configurado.")

  const cents = Math.round(opts.amountBRL * 100)

  const expiresAt = opts.dueDate
    ? new Date(opts.dueDate + "T23:59:59-03:00").toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(`${PAGBANK_BASE}/payment-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PAGBANK_TOKEN}`,
    },
    body: JSON.stringify({
      reference_id: opts.referenceId,
      name: opts.name,
      amount: { value: cents, currency: "BRL" },
      expiration_date: expiresAt,
      payment_methods: [
        { type: "PIX" },
        {
          type: "CREDIT_CARD",
          installments: [
            { quantity: 1, limit: cents },
            { quantity: 2, limit: cents },
            { quantity: 3, limit: cents },
          ],
        },
        { type: "BOLETO" },
      ],
      notification_urls: [opts.notificationUrl],
    }),
  })

  const data = await res.json() as any
  if (!res.ok) {
    const msg = (data?.error_messages as any[])?.map((e: any) => e.description).join("; ")
      || data?.message
      || JSON.stringify(data)
    throw new Error(`PagBank ${res.status}: ${msg}`)
  }

  const url = data.url
    || (data.links as any[])?.find((l: any) => l.rel === "PAY")?.href
    || (data.links as any[])?.[0]?.href
  if (!url) throw new Error("PagBank não retornou URL de pagamento.")

  return { id: data.id as string, url }
}
