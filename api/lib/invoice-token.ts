import { createHmac } from "node:crypto"
import { JWT_SECRET } from "./config"

export function signInvoiceToken(clientId: string, invoiceId: string) {
  return createHmac("sha256", JWT_SECRET)
    .update(`${clientId}:${invoiceId}`)
    .digest("base64url")
}

export function verifyInvoiceToken(clientId: string, invoiceId: string, token: string) {
  return token === signInvoiceToken(clientId, invoiceId)
}

// Stable per-client token — gives access to the client portal (all invoices)
export function signClientToken(clientId: string) {
  return createHmac("sha256", JWT_SECRET)
    .update(`portal:${clientId}`)
    .digest("base64url")
}

export function verifyClientToken(clientId: string, token: string) {
  return token === signClientToken(clientId)
}

// Short-lived (5 min) magic token that auto-logs a client into the CMS as editor
export function signCmsMagicToken(clientId: string, siteId: string): string {
  const exp  = Math.floor(Date.now() / 1000) + 300
  const data = Buffer.from(JSON.stringify({ clientId, siteId, exp })).toString("base64url")
  const sig  = createHmac("sha256", JWT_SECRET + ":cms-magic").update(data).digest("base64url")
  return `${data}.${sig}`
}

export function verifyCmsMagicToken(token: string): { clientId: string; siteId: string } | null {
  const dot = token.lastIndexOf(".")
  if (dot === -1) return null
  const data = token.slice(0, dot)
  const sig  = token.slice(dot + 1)
  const expected = createHmac("sha256", JWT_SECRET + ":cms-magic").update(data).digest("base64url")
  if (sig !== expected) return null
  try {
    const { clientId, siteId, exp } = JSON.parse(Buffer.from(data, "base64url").toString())
    if (Math.floor(Date.now() / 1000) > exp) return null
    return { clientId, siteId }
  } catch { return null }
}
