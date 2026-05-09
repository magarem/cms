import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { findUser, verifyPassword, sanitizeUser } from "../lib/users"
import { SITES_ROOT } from "../lib/content"

const JWT_SECRET = process.env.JWT_SECRET || "sirius_cms_dev_secret_change_in_production"

const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "lax") as "lax" | "strict" | "none"
const COOKIE_SECURE   = process.env.COOKIE_SECURE === "true" || COOKIE_SAMESITE === "none"

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  .post(
    "/login",
    async ({ body, jwt, cookie: { cms_token }, set }) => {
      const { site, username, password } = body

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
