import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken = await login(h.baseUrl, "admin")
})

afterAll(() => stopServer(h))

describe("Analytics", () => {
  test("GET /analytics returns empty data when no events recorded", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/analytics?days=7`)
    expect(status).toBe(200)
    expect(Array.isArray(data.days)).toBe(true)
    expect(Array.isArray(data.topPages)).toBe(true)
    expect(typeof data.devices).toBe("object")
    expect(typeof data.totals).toBe("object")
  })

  test("POST /analytics records a page view (public)", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", ref: "https://google.com", ua: "Mozilla/5.0", ip: "1.2.3.4" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test("recorded event appears in analytics query", async () => {
    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/analytics?days=1`)
    expect(data.totals.views).toBeGreaterThanOrEqual(1)
    const homePage = data.topPages.find((p: any) => p.path === "/")
    expect(homePage).toBeDefined()
    expect(homePage.views).toBeGreaterThanOrEqual(1)
  })

  test("multiple events accumulate", async () => {
    await fetch(`${h.baseUrl}/sites/${SITE}/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/about", ua: "Mozilla/5.0", ip: "5.6.7.8" }),
    })
    await fetch(`${h.baseUrl}/sites/${SITE}/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", ua: "Mozilla/5.0 Android", ip: "9.10.11.12" }),
    })

    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/analytics?days=1`)
    expect(data.totals.views).toBeGreaterThanOrEqual(3)
  })

  test("analytics returns referrer data", async () => {
    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/analytics?days=1`)
    const googleRef = data.topRefs.find((r: any) => r.ref === "https://google.com")
    expect(googleRef).toBeDefined()
  })

  test("unauthenticated GET returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "GET", `/sites/${SITE}/analytics`)
    expect(status).toBe(401)
  })
})
