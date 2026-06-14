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
