const RESEND_API_KEY = process.env.RESEND_API_KEY || ""
const FROM_EMAIL    = process.env.EMAIL_FROM || "Sirius CMS <noreply@siriusstudio.site>"
const CMS_UI_URL    = process.env.CMS_UI_URL || "http://localhost:3001"

async function resend(payload: object) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurado.")
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

export async function sendPasswordResetEmail(opts: {
  to: string
  username: string
  site: string
  resetToken: string
}) {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send")
    console.warn(`[email] Reset URL would be: ${CMS_UI_URL}/reset-password?token=${opts.resetToken}`)
    return
  }

  const resetUrl = `${CMS_UI_URL}/reset-password?token=${encodeURIComponent(opts.resetToken)}`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `Sirius CMS — Recuperação de senha (${opts.site})`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111116;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 24px;border-bottom:1px solid #1f2937;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#818cf8,#6366f1);display:inline-flex;align-items:center;justify-content:center;">
                <span style="color:white;font-size:16px;">✦</span>
              </div>
              <span style="font-size:13px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:white;">Sirius CMS</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:white;">Recuperação de senha</h1>
            <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;line-height:1.6;">
              Olá <strong style="color:white;">${opts.username}</strong>,
            </p>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;line-height:1.6;">
              Recebemos um pedido de recuperação de senha para a sua conta no site
              <strong style="color:white;font-family:monospace;">${opts.site}</strong>.
              Clique no botão abaixo para definir uma nova senha.
            </p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:12px;">
              O link é válido por <strong style="color:#9ca3af;">1 hora</strong>.
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;background:#6366f1;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.02em;">
              Definir nova senha →
            </a>
            <p style="margin:24px 0 0;color:#4b5563;font-size:12px;line-height:1.6;">
              Se não solicitou esta recuperação, pode ignorar este email em segurança.
              A sua senha não será alterada.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

export async function sendInvoiceEmail(opts: {
  to: string
  vendor: { name?: string; logo?: string; address?: string; phone?: string; email?: string; website?: string; taxId?: string }
  client: { name: string }
  invoice: { id: string; description: string; items: { label: string; amount: number }[]; total: number; status: string; dueDate?: string; paidAt?: string; createdAt: string }
}) {
  const fmt  = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
  const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" }) : ""

  const STATUS: Record<string, { label: string; color: string }> = {
    paid:      { label: "Pago",      color: "#065f46" },
    pending:   { label: "Pendente",  color: "#92400e" },
    overdue:   { label: "Vencida",   color: "#991b1b" },
    cancelled: { label: "Cancelada", color: "#374151" },
  }
  const status = STATUS[opts.invoice.status] || { label: opts.invoice.status, color: "#374151" }

  const v         = opts.vendor
  const vendorName = v.name || "Fornecedor"
  const fromEmail  = v.email ? `${vendorName} <${v.email}>` : FROM_EMAIL

  const logoBlock = v.logo
    ? `<img src="${v.logo}" alt="${vendorName}" style="height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px;">`
    : `<div style="font-size:20px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#111;">${vendorName}</div>`

  const contactLine = [v.address, v.phone, v.website].filter(Boolean).join("  ·  ")
  const taxLine     = v.taxId ? `<div style="color:#aaa;font-size:11px;margin-top:2px;">${v.taxId}</div>` : ""

  const itemRows = (opts.invoice.items || []).map(item => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #efefef;font-size:14px;color:#333;">${item.label}</td>
      <td style="padding:11px 0;border-bottom:1px solid #efefef;font-size:14px;color:#111;font-weight:600;text-align:right;white-space:nowrap;">${fmt(item.amount)}</td>
    </tr>`).join("")

  const dueDateRow = opts.invoice.dueDate
    ? `<tr><td style="padding:4px 0;font-size:12px;color:#888;">Vencimento</td><td style="padding:4px 0;font-size:12px;color:#555;text-align:right;">${fmtD(opts.invoice.dueDate)}</td></tr>`
    : ""
  const paidAtRow = opts.invoice.paidAt
    ? `<tr><td style="padding:4px 0;font-size:12px;color:#888;">Pago em</td><td style="padding:4px 0;font-size:12px;color:#059669;text-align:right;">${fmtD(opts.invoice.paidAt)}</td></tr>`
    : ""

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

  <!-- Vendor header -->
  <tr>
    <td style="padding:28px 32px 24px;border-bottom:1px solid #f0f0f0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>${logoBlock}
            ${contactLine ? `<div style="font-size:11px;color:#999;margin-top:4px;">${contactLine}</div>` : ""}
            ${taxLine}
          </td>
          <td style="text-align:right;vertical-align:top;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#aaa;">Fatura</div>
            <div style="font-size:18px;font-weight:800;color:#111;">#${opts.invoice.id}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 32px;">

      <p style="margin:0 0 6px;font-size:13px;color:#888;">Olá, <strong style="color:#111;">${opts.client.name}</strong></p>
      <h1 style="margin:0 0 24px;font-size:20px;font-weight:800;color:#111;line-height:1.3;">${opts.invoice.description}</h1>

      <!-- Meta -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#888;">Emitida em</td>
          <td style="padding:4px 0;font-size:12px;color:#555;text-align:right;">${fmtD(opts.invoice.createdAt)}</td>
        </tr>
        ${dueDateRow}${paidAtRow}
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#888;">Status</td>
          <td style="padding:4px 0;text-align:right;">
            <span style="background:${status.color}18;color:${status.color};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 10px;border-radius:20px;">
              ${status.label}
            </span>
          </td>
        </tr>
      </table>

      <!-- Items -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0;">
        <thead>
          <tr>
            <th style="padding:8px 0;border-bottom:2px solid #111;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;text-align:left;font-weight:600;">Descrição</th>
            <th style="padding:8px 0;border-bottom:2px solid #111;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;text-align:right;font-weight:600;">Valor</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Total -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;padding-top:16px;border-top:2px solid #111;">
        <tr>
          <td style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#999;">Total</td>
          <td style="text-align:right;font-size:26px;font-weight:900;color:#111;">${fmt(opts.invoice.total)}</td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:1px solid #f0f0f0;background:#fafafa;">
      <p style="margin:0;font-size:11px;color:#bbb;text-align:center;">${vendorName} — ${new Date().getFullYear()}</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`

  await resend({
    from:    fromEmail,
    to:      opts.to,
    subject: `Fatura — ${opts.invoice.description}`,
    html,
  })
}
