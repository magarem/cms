import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string
let viewerToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
  viewerToken = await login(h.baseUrl, "viewer")
})

afterAll(() => stopServer(h))

describe("Tree", () => {
  test("GET /sites/:site/tree returns array with home", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/tree`)
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.tree)).toBe(true)
    const home = data.tree.find((n: any) => n.name === "home")
    expect(home).toBeDefined()
    expect(data.version).toBe("v1")
  })

  test("unauthenticated request returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "GET", `/sites/${SITE}/tree`)
    expect(status).toBe(401)
  })
})

describe("Pages — CRUD", () => {
  test("POST creates a page", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/page`, {
      path: "about",
      title: "About Us",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test("GET reads the created page", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data).toBeDefined()
  })

  test("PUT updates page content", async () => {
    const { data: page } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    const updated = { ...page.data, title: "About Updated" }
    const { status, data } = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/page?path=about`, updated)
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: refetch } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(refetch.data.title).toBe("About Updated")
  })

  test("editor can update pages", async () => {
    const { data: page } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    const { status } = await req(h.baseUrl, editorToken, "PUT", `/sites/${SITE}/page?path=about`, page.data)
    expect(status).toBe(200)
  })

  test("viewer cannot create pages", async () => {
    const { status } = await req(h.baseUrl, viewerToken, "POST", `/sites/${SITE}/page`, {
      path: "viewer-page",
      title: "Viewer Page",
    })
    expect(status).toBe(403)
  })

  test("viewer cannot update pages", async () => {
    const { data: page } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    const { status } = await req(h.baseUrl, viewerToken, "PUT", `/sites/${SITE}/page?path=about`, page.data)
    expect(status).toBe(403)
  })

  test("GET non-existent page returns 404", async () => {
    const { status } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=does-not-exist`)
    expect(status).toBe(404)
  })

  test("PUT saves SEO fields inside page data", async () => {
    const { data: page } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    const withSeo = { ...page.data, seo: { title: "SEO Title", description: "SEO Desc", noIndex: false } }
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/page?path=about`, withSeo)
    const { data: refetch } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(refetch.data.seo?.title).toBe("SEO Title")
    expect(refetch.data.seo?.description).toBe("SEO Desc")
  })

  test("viewer cannot delete pages", async () => {
    const { status } = await req(h.baseUrl, viewerToken, "DELETE", `/sites/${SITE}/page?path=about`)
    expect(status).toBe(403)
  })

  test("DELETE removes the page", async () => {
    // Create a disposable page first
    await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/page`, { path: "disposable", title: "Temp" })
    const { status } = await req(h.baseUrl, adminToken, "DELETE", `/sites/${SITE}/page?path=disposable`)
    expect(status).toBe(200)
    const { status: getStatus } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=disposable`)
    expect(getStatus).toBe(404)
  })
})

describe("Pages — Markdown", () => {
  test("PUT /markdown writes content.md", async () => {
    // path query is relative to the version dir, so include filename
    const { status } = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/markdown?path=about/content.md`, {
      content: "# Hello\n\nThis is markdown.",
    })
    expect(status).toBe(200)
  })

  test("GET /markdown reads content.md", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/markdown?path=about/content.md`)
    expect(status).toBe(200)
    expect(data.content).toContain("Hello")
  })
})
