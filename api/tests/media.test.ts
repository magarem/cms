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

// ── helpers ────────────────────────────────────────────────────────────────

async function uploadFile(
  baseUrl: string,
  token: string,
  filename: string,
  mimeType: string,
  data: Uint8Array | Buffer,
  uploadPath?: string,
): Promise<{ status: number; data: any }> {
  const form = new FormData()
  form.append("file", new Blob([data], { type: mimeType }), filename)
  if (uploadPath) form.append("path", uploadPath)

  const res = await fetch(`${baseUrl}/sites/${SITE}/media/upload`, {
    method: "POST",
    headers: { Cookie: `cms_token=${token}` },
    body: form,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json }
}

// Minimal 1×1 PNG (valid, processable by sharp — output stays .png)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

const TINY_PDF = new TextEncoder().encode("%PDF-1.0\n1 0 obj<</Type /Catalog>>endobj\n%%EOF")

// ── List ───────────────────────────────────────────────────────────────────

describe("media list", () => {
  test("GET /media returns success with empty items initially", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(Array.isArray(r.data.items)).toBe(true)
  })

  test("unauthenticated returns 401", async () => {
    const r = await req(h.baseUrl, "bad-token", "GET", `/sites/${SITE}/media`)
    expect(r.status).toBe(401)
  })
})

// ── Upload ─────────────────────────────────────────────────────────────────

describe("media upload", () => {
  test("uploads a PNG and gets a .png back", async () => {
    const r = await uploadFile(h.baseUrl, adminToken, "photo.png", "image/png", TINY_PNG)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.name).toMatch(/\.png$/)
  })

  test("uploaded file appears in list", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media`)
    expect(r.data.items.some((i: any) => i.name.endsWith(".png"))).toBe(true)
  })

  test("uploads a non-image (PDF) without conversion", async () => {
    const r = await uploadFile(h.baseUrl, adminToken, "doc.pdf", "application/pdf", TINY_PDF)
    expect(r.status).toBe(200)
    expect(r.data.name).toBe("doc.pdf")
  })

  test("uploads into a subfolder", async () => {
    const r = await uploadFile(h.baseUrl, adminToken, "sub.png", "image/png", TINY_PNG, "team")
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media?path=team`)
    expect(list.data.items.some((i: any) => i.name === "sub.png")).toBe(true)
  })

  test("viewer cannot upload", async () => {
    const r = await uploadFile(h.baseUrl, viewerToken, "x.png", "image/png", TINY_PNG)
    expect(r.status).toBe(403)
  })
})

// ── Rename ─────────────────────────────────────────────────────────────────

describe("media rename", () => {
  test("renames a file", async () => {
    await uploadFile(h.baseUrl, adminToken, "rename-me.png", "image/png", TINY_PNG)
    const r = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/media/rename`, {
      path: "rename-me.png",
      newName: "renamed.png",
    })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media`)
    expect(list.data.items.some((i: any) => i.name === "renamed.png")).toBe(true)
    expect(list.data.items.some((i: any) => i.name === "rename-me.png")).toBe(false)
  })

  test("viewer cannot rename", async () => {
    const r = await req(h.baseUrl, viewerToken, "PUT", `/sites/${SITE}/media/rename`, {
      path: "renamed.png",
      newName: "x.png",
    })
    expect(r.status).toBe(403)
  })
})

// ── Move ───────────────────────────────────────────────────────────────────

describe("media move", () => {
  test("moves a file into a subfolder", async () => {
    await uploadFile(h.baseUrl, adminToken, "move-me.png", "image/png", TINY_PNG)
    const r = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/media/move`, {
      path: "move-me.png",
      destination: "archive/move-me.png",
    })
    expect(r.status).toBe(200)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media?path=archive`)
    expect(list.data.items.some((i: any) => i.name === "move-me.png")).toBe(true)
  })
})

// ── Copy ───────────────────────────────────────────────────────────────────

describe("media copy", () => {
  test("duplicates a file in place", async () => {
    await uploadFile(h.baseUrl, adminToken, "copy-me.png", "image/png", TINY_PNG)
    const r = await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/media/copy`, {
      path: "copy-me.png",
    })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media`)
    const copies = list.data.items.filter((i: any) => i.name.startsWith("copy-me"))
    expect(copies.length).toBeGreaterThanOrEqual(2)
  })
})

// ── Serve ──────────────────────────────────────────────────────────────────

describe("media serve", () => {
  test("serves an uploaded file", async () => {
    await uploadFile(h.baseUrl, adminToken, "serve-me.png", "image/png", TINY_PNG)
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/media/serve?path=serve-me.png`, {
      headers: { Cookie: `cms_token=${adminToken}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image")
  })

  test("404 for non-existent file", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/media/serve?path=no-such-file.png`, {
      headers: { Cookie: `cms_token=${adminToken}` },
    })
    expect(res.status).toBe(404)
  })
})

// ── Delete ─────────────────────────────────────────────────────────────────

describe("media delete", () => {
  test("deletes a file", async () => {
    await uploadFile(h.baseUrl, adminToken, "delete-me.png", "image/png", TINY_PNG)
    const r = await req(h.baseUrl, adminToken, "DELETE", `/sites/${SITE}/media?path=delete-me.png`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/media`)
    expect(list.data.items.some((i: any) => i.name === "delete-me.png")).toBe(false)
  })

  test("viewer cannot delete", async () => {
    const r = await req(h.baseUrl, viewerToken, "DELETE", `/sites/${SITE}/media?path=photo.png`)
    expect(r.status).toBe(403)
  })
})
