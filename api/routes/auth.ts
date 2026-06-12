import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { findUser, verifyPassword, sanitizeUser, readUsers, writeUsers, hashPassword } from "../lib/users"
import { SITES_ROOT } from "../lib/content"
import { JWT_SECRET } from "../lib/config"
import { sendPasswordResetEmail } from "../lib/email"

const COOKIE_SAMESITE  = (process.env.COOKIE_SAMESITE || "lax") as "lax" | "strict" | "none"
const COOKIE_SECURE    = process.env.COOKIE_SECURE === "true" || COOKIE_SAMESITE === "none"
const ROOT_USERNAME    = process.env.ROOT_USERNAME || ""
const ROOT_PASSWORD    = process.env.ROOT_PASSWORD || ""

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .use(jwt({ name: "resetJwt", secret: JWT_SECRET + ":reset", exp: "1h" }))

  .post(
    "/login",
    async ({ body, jwt, cookie: { cms_token }, set }) => {
      const { site, username, password } = body

      // ── Root master access ───────────────────────────────
      if (ROOT_USERNAME && ROOT_PASSWORD && username === ROOT_USERNAME && password === ROOT_PASSWORD) {
        const token = await jwt.sign({ id: "root", username: "root", role: "admin", sites: ["*"], site })
        cms_token.set({ value: token, httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: "/", sameSite: COOKIE_SAMESITE, secure: COOKIE_SECURE })
        return { success: true, user: { id: "root", username: "root", role: "admin", sites: ["*"], site } }
      }

      const sitePath = join(SITES_ROOT, site)
      if (!existsSync(sitePath)) {
        set.status = 404
        return { success: false, error: "Site não encontrado." }
      }

      const user = await findUser(site, username)
      if (!user) {
        set.status = 401
        return { success: false, error: "Credenciais inválidas." }
      }

      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid) {
        set.status = 401
        return { success: false, error: "Credenciais inválidas." }
      }

      const hasAccess = user.sites.includes("*") || user.sites.includes(site)
      if (!hasAccess) {
        set.status = 403
        return { success: false, error: "Sem acesso a este site." }
      }

      const token = await jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        sites: user.sites,
        site,
      })

      cms_token.set({
        value: token,
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
      })

      return { success: true, user: { ...sanitizeUser(user), site } }
    },
    {
      body: t.Object({
        site: t.String({ minLength: 1 }),
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    }
  )

  .post("/logout", ({ cookie: { cms_token } }) => {
    cms_token.remove({
      path: "/",
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
    })
    return { success: true }
  })

  .get("/me", async ({ cookie: { cms_token }, jwt, set }) => {
    const payload = await jwt.verify(cms_token?.value || "")
    if (!payload) {
      set.status = 401
      return { error: "Não autenticado." }
    }
    return { success: true, user: payload }
  })

  .post(
    "/forgot-password",
    async ({ body, resetJwt }) => {
      // Always return success — never reveal whether the user/email exists
      try {
        const user = await findUser(body.site, body.username)
        if (user?.email) {
          const token = await resetJwt.sign({ id: user.id, site: body.site, type: "reset" })
          await sendPasswordResetEmail({
            to: user.email,
            username: user.username,
            site: body.site,
            resetToken: token,
          })
        }
      } catch (e) {
        console.error("[forgot-password]", e)
      }
      return { success: true }
    },
    {
      body: t.Object({
        site:     t.String({ minLength: 1 }),
        username: t.String({ minLength: 1 }),
      }),
    }
  )

  .post(
    "/reset-password",
    async ({ body, resetJwt, set }) => {
      const payload = await resetJwt.verify(body.token) as any
      if (!payload || payload.type !== "reset") {
        set.status = 400
        return { success: false, error: "Token inválido ou expirado." }
      }

      const { users } = await readUsers(payload.site)
      const idx = users.findIndex((u: any) => u.id === payload.id)
      if (idx === -1) {
        set.status = 404
        return { success: false, error: "Utilizador não encontrado." }
      }

      users[idx].passwordHash = await hashPassword(body.password)
      await writeUsers(payload.site, { users })
      return { success: true }
    },
    {
      body: t.Object({
        token:    t.String(),
        password: t.String({ minLength: 6 }),
      }),
    }
  )
