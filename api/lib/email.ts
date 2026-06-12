const RESEND_API_KEY = process.env.RESEND_API_KEY || ""
const FROM_EMAIL    = process.env.EMAIL_FROM || "Sirius CMS <noreply@siriusstudio.site>"
const CMS_UI_URL    = process.env.CMS_UI_URL || "http://localhost:3001"

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
