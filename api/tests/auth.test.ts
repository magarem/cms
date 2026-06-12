import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let token: string

beforeAll(async () => {
  h = await startServer()
  token = await login(h.baseUrl)
})

afterAll(() => stopServer(h))

describe("Health", () => {
  test("GET /health returns ok", async () => {
    const res = await fetch(`${h.baseUrl}/health`)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.status).toBe("ok")
    expect(typeof data.ts).toBe("string")
  })
})

describe("Auth — login", () => {
  test("valid credentials set cookie and return user", async () => {
    const res = await fetch(`${h.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: SITE, username: "admin", password: "testpass" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.user.username).toBe("admin")
    expect(data.user.role).toBe("admin")
    expect(res.headers.get("set-cookie")).toContain("cms_token=")
  })

  test("wrong password returns 401", async () => {
    const { status, data } = await req(h.baseUrl, "", "POST", "/auth/login", {
      site: SITE, username: "admin", password: "wrong",
    })
    expect(status).toBe(401)
    expect(data.success).toBe(false)
  })

  test("unknown user returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "POST", "/auth/login", {
      site: SITE, username: "ghost", password: "testpass",
    })
    expect(status).toBe(401)
  })

  test("missing fields returns error", async () => {
    const res = await fetch(`${h.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: SITE }),
    })
    expect(res.status).not.toBe(200)
  })
})

describe("Auth — /me", () => {
  test("GET /auth/me returns current user", async () => {
    const { status, data } = await req(h.baseUrl, token, "GET", "/auth/me")
    expect(status).toBe(200)
    expect(data.user.username).toBe("admin")
    expect(data.user.passwordHash).toBeUndefined()
  })

  test("GET /auth/me without token returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "GET", "/auth/me")
    expect(status).toBe(401)
  })

  test("GET /auth/me with invalid token returns 401", async () => {
    const { status } = await req(h.baseUrl, "bad.token.value", "GET", "/auth/me")
    expect(status).toBe(401)
  })
})

describe("Auth — logout", () => {
  test("POST /auth/logout clears cookie", async () => {
    const res = await fetch(`${h.baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Cookie: `cms_token=${token}` },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    const cookie = res.headers.get("set-cookie") ?? ""
    // Cookie should be cleared (expires in past or empty value)
    expect(cookie).toMatch(/cms_token=;|cms_token=\s*;|Max-Age=0|Expires=Thu, 01 Jan 1970/)
  })
})
