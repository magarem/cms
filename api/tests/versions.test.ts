import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken  = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
})
afterAll(() => stopServer(h))

describe("versions", () => {
  test("initial settings has v1 as activeEditionVersion", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(r.status).toBe(200)
    expect(r.data.settings.activeEditionVersion).toBe("v1")
    expect(r.data.settings.siteVersions).toContain("v1")
  })

  test("editor cannot create a version", async () => {
    const r = await req(h.baseUrl, editorToken, "POST", `/sites/${SITE}/versions`, { name: "v2" })
    expect(r.status).toBe(403)
  })

  test("unauthenticated cannot create a version", async () => {
    const r = await req(h.baseUrl, "bad-token", "POST", `/sites/${SITE}/versions`, { name: "v2" })
    expect(r.status).toBe(401)
  })

  test("admin creates a new version", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "v2" })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.version).toBe("v2")
    expect(r.data.versions).toContain("v2")
    expect(r.data.versions).toContain("v1")
  })

  test("new version appears in settings", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(r.data.settings.siteVersions).toContain("v2")
  })

  test("duplicate version name returns 409", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "v2" })
    expect(r.status).toBe(409)
  })

  test("'production' is reserved — returns 400", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "production" })
    expect(r.status).toBe(400)
  })

  test("invalid version name (empty after sanitise) returns 400", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "!!!" })
    expect(r.status).toBe(400)
  })

  test("version name is sanitised to lowercase slug", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "My Branch" })
    expect(r.status).toBe(200)
    expect(r.data.version).toBe("my-branch")
  })

  test("new version copies content from active version", async () => {
    // Write a distinctive page in v1
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/page?path=home`, {
      title: "Source for fork",
      blocks: [],
    })

    // Create v3 (copies from v1 which is activeEditionVersion)
    const create = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "v3" })
    expect(create.status).toBe(200)

    // Switch to v3 and read the page
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/settings`, { activeEditionVersion: "v3" })
    const page = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=home`)
    expect(page.data.data.title).toBe("Source for fork")

    // Restore active edition to v1
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/settings`, { activeEditionVersion: "v1" })
  })
})

describe("publish", () => {
  test("editor cannot publish", async () => {
    const r = await req(h.baseUrl, editorToken, "POST", `/sites/${SITE}/publish`)
    expect(r.status).toBe(403)
  })

  test("admin publishes and gets publishedAt timestamp", async () => {
    const before = Date.now()
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/publish`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.from).toBe("v1")
    expect(new Date(r.data.publishedAt).getTime()).toBeGreaterThanOrEqual(before)
  })

  test("settings reflect lastPublished and publishedFrom after publish", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(r.data.settings.lastPublished).toBeTruthy()
    expect(r.data.settings.publishedFrom).toBe("v1")
  })

  test("activeEditionVersion stays v1 after publish", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(r.data.settings.activeEditionVersion).toBe("v1")
  })

  test("production version appears in siteVersions after publish", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(r.data.settings.siteVersions).toContain("production")
  })

  test("published content matches source version", async () => {
    // Write to v1
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/page?path=home`, {
      title: "Production ready",
      blocks: [],
    })
    // Publish
    await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/publish`)

    // Switch to production and verify content
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/settings`, { activeEditionVersion: "production" })
    const page = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=home`)
    expect(page.data.data.title).toBe("Production ready")

    // Restore
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/settings`, { activeEditionVersion: "v1" })
  })
})
