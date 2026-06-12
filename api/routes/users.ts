import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readUsers, writeUsers, hashPassword, sanitizeUser } from "../lib/users"
import { JWT_SECRET } from "../lib/config"

async function getAuthedAdmin(jwt: any, token: string | undefined) {
  if (!token) return null
  const user = await jwt.verify(token) as any
  if (!user || user.role !== "admin") return null
  return user
}

export const usersRoutes = new Elysia({ prefix: "/users" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  .get("/", async ({ cookie: { cms_token }, jwt, set }) => {
    const user = await getAuthedAdmin(jwt, cms_token?.value)
    if (!user) { set.status = 403; return { error: "Sem permissão." } }

    const { users } = await readUsers(user.site)
    return { success: true, users: users.map(sanitizeUser) }
  })

  .post(
    "/",
    async ({ body, cookie: { cms_token }, jwt, set }) => {
      const user = await getAuthedAdmin(jwt, cms_token?.value)
      if (!user) { set.status = 403; return { error: "Sem permissão." } }

      const { users } = await readUsers(user.site)
      if (users.find((u) => u.username === body.username)) {
        set.status = 409
        return { error: "Utilizador já existe." }
      }

      const newUser = {
        id: crypto.randomUUID(),
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        sites: [user.site],
        email: body.email || undefined,
      }
      users.push(newUser)
      await writeUsers(user.site, { users })
      return { success: true, user: sanitizeUser(newUser) }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 2 }),
        password: t.String({ minLength: 6 }),
        role: t.Union([t.Literal("admin"), t.Literal("editor"), t.Literal("viewer")]),
        email: t.Optional(t.String()),
      }),
    }
  )

  .put(
    "/:id",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getAuthedAdmin(jwt, cms_token?.value)
      if (!user) { set.status = 403; return { error: "Sem permissão." } }

      const { users } = await readUsers(user.site)
      const idx = users.findIndex((u) => u.id === params.id)
      if (idx === -1) { set.status = 404; return { error: "Utilizador não encontrado." } }

      if ((body as any).password) {
        users[idx].passwordHash = await hashPassword((body as any).password)
      }
      if ((body as any).role) users[idx].role = (body as any).role
      if ("email" in (body as any)) users[idx].email = (body as any).email || undefined

      await writeUsers(user.site, { users })
      return { success: true, user: sanitizeUser(users[idx]) }
    },
    { body: t.Any() }
  )

  .delete("/:id", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getAuthedAdmin(jwt, cms_token?.value)
    if (!user) { set.status = 403; return { error: "Sem permissão." } }

    const { users } = await readUsers(user.site)
    const filtered = users.filter((u) => u.id !== params.id)
    if (filtered.length === users.length) { set.status = 404; return { error: "Utilizador não encontrado." } }

    await writeUsers(user.site, { users: filtered })
    return { success: true }
  })
