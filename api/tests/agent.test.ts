import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let viewerToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken  = await login(h.baseUrl, "admin")
  viewerToken = await login(h.baseUrl, "viewer")
})
afterAll(() => stopServer(h))

// ── apply-spec ──────────────────────────────────────────────────────────────
// This endpoint creates/updates pages from a spec array without calling Claude.
// It is the deterministic half of the AI agent — testable without any API key.

describe("apply-spec", () => {
  test("unauthenticated returns 401", async () => {
    const r = await req(h.baseUrl, "bad-token", "POST", `/sites/${SITE}/apply-spec`, {
      pages: [{ path: "about", title: "About" }],
    })
    expect(r.status).toBe(401)
  })

  test("viewer returns 403", async () => {
    const r = await req(h.baseUrl, viewerToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [{ path: "about", title: "About" }],
    })
    expect(r.status).toBe(403)
  })

  test("empty pages array returns 400", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, { pages: [] })
    expect(r.status).toBe(400)
  })

  test("creates a page from spec", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [
        {
          path: "about",
          title: "About Us",
          data: { description: "Our story" },
          blocks: [
            { componentName: "Hero", isHero: true, props: { title: "About Us" } },
            { componentName: "ContentMD", props: {} },
          ],
        },
      ],
    })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.results).toHaveLength(1)
    expect(r.data.results[0].status).toBe("created")
    expect(r.data.results[0].path).toBe("about")
  })

  test("created page is readable with blocks", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(r.status).toBe(200)
    expect(r.data.data.title).toBe("About Us")
    expect(Array.isArray(r.data.data.blocks)).toBe(true)
    expect(r.data.data.blocks.length).toBe(2)
    expect(r.data.data.blocks[0].componentName).toBe("Hero")
    expect(r.data.data.blocks[0].isHero).toBe(true)
    expect(typeof r.data.data.blocks[0].id).toBe("string")
  })

  test("existing page is skipped when overwrite is false (default)", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [{ path: "about", title: "New Title" }],
    })
    expect(r.data.results[0].status).toBe("skipped")

    const page = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(page.data.data.title).toBe("About Us")
  })

  test("existing page is updated when overwrite is true", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [{ path: "about", title: "Updated Title", overwrite: true }],
    })
    expect(r.data.results[0].status).toBe("updated")

    const page = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=about`)
    expect(page.data.data.title).toBe("Updated Title")
  })

  test("creates multiple pages in one call", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [
        { path: "services", title: "Services" },
        { path: "contact", title: "Contact" },
        { path: "blog/first-post", title: "First Post" },
      ],
    })
    expect(r.status).toBe(200)
    expect(r.data.results).toHaveLength(3)
    expect(r.data.results.every((x: any) => x.status === "created")).toBe(true)
  })

  test("page with markdown creates content.md", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [
        {
          path: "terms",
          title: "Terms",
          markdown: "# Terms\n\nThese are our terms.",
        },
      ],
    })
    expect(r.data.results[0].status).toBe("created")

    const md = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/markdown?path=terms/content.md`)
    expect(md.status).toBe(200)
    expect(md.data.content).toContain("These are our terms.")
  })

  test("missing path in spec item returns error status (not 400)", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/apply-spec`, {
      pages: [
        { path: "valid-page", title: "Valid" },
        { title: "No path given" },
      ],
    })
    expect(r.status).toBe(200)
    const errResult = r.data.results.find((x: any) => x.status === "error")
    expect(errResult).toBeTruthy()
    const okResult = r.data.results.find((x: any) => x.path === "valid-page")
    expect(okResult.status).toBe("created")
    expect(r.data.success).toBe(false)
  })
})

// ── agent/generate — ANTHROPIC_API_KEY not set in test env ─────────────────

describe("agent/generate (no API key)", () => {
  test("returns 500 when ANTHROPIC_API_KEY is not set", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/agent/generate`, {
      prompt: "Create a landing page",
    })
    // The test server is started without ANTHROPIC_API_KEY so the route returns 500
    expect(r.status).toBe(500)
    expect(r.data.error).toMatch(/ANTHROPIC_API_KEY/)
  })

  test("viewer cannot call agent/generate", async () => {
    const r = await req(h.baseUrl, viewerToken, "POST", `/sites/${SITE}/agent/generate`, {
      prompt: "Do something",
    })
    expect(r.status).toBe(403)
  })

  test("missing prompt returns 400", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/agent/generate`, {
      prompt: "  ",
    })
    // Either 400 (empty prompt) or 500 (no API key) — whichever fires first
    expect([400, 500]).toContain(r.status)
  })
})
