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
