import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let token: string

beforeAll(async () => {
  h = await startServer()
  token = await login(h.baseUrl)
})

afterAll(() => stopServer(h))

describe("Global data", () => {
  test("GET /global returns empty object when no files exist", async () => {
    const { status, data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/global`)
    expect(status).toBe(200)
    expect(typeof data).toBe("object")
  })

  test("PUT /global/:key writes a key", async () => {
    const { status, data } = await req(h.baseUrl, token, "PUT", `/sites/${SITE}/global/nav`, {
      links: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }],
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test("GET /global returns the written key", async () => {
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/global`)
    // Response shape: { global: { nav: { data: {...}, ext: ".json" } } }
    expect(data.global.nav).toBeDefined()
    expect(Array.isArray(data.global.nav.data.links)).toBe(true)
    expect(data.global.nav.data.links).toHaveLength(2)
  })

  test("PUT overwrites an existing key", async () => {
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/global/nav`, { links: [{ label: "Home", href: "/" }] })
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/global`)
    expect(data.global.nav.data.links).toHaveLength(1)
  })

  test("multiple keys are merged in GET", async () => {
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/global/footer`, { text: "© 2026" })
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/global`)
    expect(data.global.nav).toBeDefined()
    expect(data.global.footer).toBeDefined()
    expect(data.global.footer.data.text).toBe("© 2026")
  })

  test("unauthenticated request returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "GET", `/sites/${SITE}/global`)
    expect(status).toBe(401)
  })
})
