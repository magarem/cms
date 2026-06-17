import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string
let viewerToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken  = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
  viewerToken = await login(h.baseUrl, "viewer")
})
afterAll(() => stopServer(h))

const MODEL = {
  name: "article",
  label: "Article",
  description: "A blog post model",
  target: "page" as const,
  fields: [
    { name: "author", type: "text", label: "Author" },
    { name: "publishedAt", type: "date", label: "Published At" },
  ],
  blocks: [
    { componentName: "Hero", isHero: true, label: "Hero" },
    { componentName: "ContentMD" },
  ],
}

describe("models", () => {
  test("list is empty initially", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(Array.isArray(r.data.models)).toBe(true)
    expect(r.data.models.length).toBe(0)
  })

  test("unauthenticated list returns 401", async () => {
    const r = await req(h.baseUrl, "bad-token", "GET", `/sites/${SITE}/models`)
    expect(r.status).toBe(401)
  })

  test("admin creates a model", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/models`, MODEL)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.model.name).toBe("article")
    expect(r.data.model.label).toBe("Article")
    expect(Array.isArray(r.data.model.fields)).toBe(true)
    expect(Array.isArray(r.data.model.blocks)).toBe(true)
  })

  test("editor can also create/update a model", async () => {
    const r = await req(h.baseUrl, editorToken, "POST", `/sites/${SITE}/models`, {
      name: "product",
      label: "Product",
    })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
  })

  test("viewer cannot create a model", async () => {
    const r = await req(h.baseUrl, viewerToken, "POST", `/sites/${SITE}/models`, {
      name: "event",
      label: "Event",
    })
    expect(r.status).toBe(403)
  })

  test("GET list now returns the created models", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models`)
    expect(r.data.models.length).toBeGreaterThanOrEqual(2)
    expect(r.data.models.some((m: any) => m.name === "article")).toBe(true)
  })

  test("GET single model by name", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models/article`)
    expect(r.status).toBe(200)
    expect(r.data.model.name).toBe("article")
    expect(r.data.model.fields.length).toBe(2)
  })

  test("GET unknown model returns 404", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models/no-such-model`)
    expect(r.status).toBe(404)
  })

  test("POST with same name updates (upsert)", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/models`, {
      name: "article",
      label: "Article Updated",
      description: "Updated description",
    })
    expect(r.status).toBe(200)
    expect(r.data.model.label).toBe("Article Updated")

    const get = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models/article`)
    expect(get.data.model.label).toBe("Article Updated")
  })

  test("name is sanitised (spaces → slug)", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/models`, {
      name: "My Cool Model",
      label: "My Cool Model",
    })
    expect(r.status).toBe(200)
    expect(r.data.model.name).toBe("my-cool-model")
  })

  test("editor cannot delete a model", async () => {
    const r = await req(h.baseUrl, editorToken, "DELETE", `/sites/${SITE}/models/product`)
    expect(r.status).toBe(403)
  })

  test("admin deletes a model", async () => {
    const r = await req(h.baseUrl, adminToken, "DELETE", `/sites/${SITE}/models/article`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const get = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/models/article`)
    expect(get.status).toBe(404)
  })
})
