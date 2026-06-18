import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readdir, readFile, writeFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"

async function requireAuth(jwt: any, token: string | undefined, set: any) {
  if (!token) { set.status = 401; return null }
  const user = await jwt.verify(token) as any
  if (!user) { set.status = 401; return null }
  return user
}

function messagesDir(site: string) {
  return join(SITES_ROOT, site, "_messages")
}

async function listMessages(site: string) {
  const dir = messagesDir(site)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter(f => f.endsWith(".json"))
  const msgs = await Promise.all(
    files.map(async f => {
      try { return JSON.parse(await readFile(join(dir, f), "utf-8")) } catch { return null }
    })
  )
  return msgs
    .filter(Boolean)
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
}

export const messagesRoutes = new Elysia({ prefix: "/sites/:site/messages" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // List all messages
  .get("/", async ({ params, cookie: { cms_token }, jwt, set }) => {
    if (!await requireAuth(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const messages = await listMessages(params.site)
    const unread = messages.filter(m => m.status === "novo").length
    return { success: true, messages, unread }
  })

  // Update status
  .put("/:id", async ({ params, body, cookie: { cms_token }, jwt, set }) => {
    if (!await requireAuth(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const path = join(messagesDir(params.site), `${params.id}.json`)
    if (!existsSync(path)) { set.status = 404; return { error: "Mensagem não encontrada." } }
    const msg = JSON.parse(await readFile(path, "utf-8"))
    const updated = { ...msg, status: (body as any).status ?? msg.status }
    await writeFile(path, JSON.stringify(updated, null, 2))
    return { success: true, message: updated }
  }, {
    body: t.Object({ status: t.Optional(t.String()) })
  })

  // Delete
  .delete("/:id", async ({ params, cookie: { cms_token }, jwt, set }) => {
    if (!await requireAuth(jwt, cms_token?.value, set)) return { error: "Sem acesso." }
    const path = join(messagesDir(params.site), `${params.id}.json`)
    if (!existsSync(path)) { set.status = 404; return { error: "Mensagem não encontrada." } }
    await unlink(path)
    return { success: true }
  })
