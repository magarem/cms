import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
})

afterAll(() => stopServer(h))

describe("Settings", () => {
  test("GET /settings returns site config", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(status).toBe(200)
    expect(data.settings.activeEditionVersion).toBe("v1")
    expect(Array.isArray(data.settings.siteVersions)).toBe(true)
  })

  test("PUT /settings updates activeEditionVersion", async () => {
    // Create v2 first so we can switch to it
    await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, { name: "v2-settings-test" })
    const { status, data } = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/settings`, {
      activeEditionVersion: "v2-settings-test",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: res } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/settings`)
    expect(res.settings.activeEditionVersion).toBe("v2-settings-test")
  })

  test("editor can also update settings", async () => {
    const { status } = await req(h.baseUrl, editorToken, "PUT", `/sites/${SITE}/settings`, {
      siteName: "Editor Updated",
    })
    expect(status).toBe(200)
  })

  test("unauthenticated request returns 401", async () => {
    const { status } = await req(h.baseUrl, "", "GET", `/sites/${SITE}/settings`)
    expect(status).toBe(401)
  })
})

describe("Versions", () => {
  test("GET /versions lists available versions", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/versions`)
    expect(status).toBe(200)
    expect(Array.isArray(data.versions)).toBe(true)
    expect(data.versions).toContain("v1")
  })

  test("POST /versions creates a new version", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/versions`, {
      name: "v2",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: versions } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/versions`)
    expect(versions.versions).toContain("v2")
  })
})
