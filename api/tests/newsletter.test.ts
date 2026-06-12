import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string

beforeAll(async () => {
  h = await startServer()
  adminToken = await login(h.baseUrl, "admin")
})

afterAll(() => stopServer(h))

describe("Newsletter", () => {
  test("GET /newsletter returns empty list initially", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/newsletter`)
    expect(status).toBe(200)
    expect(Array.isArray(data.subscribers)).toBe(true)
  })

  test("POST /newsletter/subscribe adds a subscriber (public)", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", name: "Test User" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test("subscriber appears in the list", async () => {
    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/newsletter`)
    const sub = data.subscribers.find((s: any) => s.email === "test@example.com")
    expect(sub).toBeDefined()
    expect(sub.name).toBe("Test User")
    expect(sub.subscribedAt).toBeDefined()
  })

  test("duplicate subscribe is idempotent", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/newsletter/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    })
    expect(res.status).toBe(200)
    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/newsletter`)
    const matches = data.subscribers.filter((s: any) => s.email === "test@example.com")
    expect(matches).toHaveLength(1)
  })

  test("DELETE /newsletter removes subscriber", async () => {
    const { status, data } = await req(
      h.baseUrl, adminToken, "DELETE",
      `/sites/${SITE}/newsletter?email=test@example.com`,
    )
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: list } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/newsletter`)
    expect(list.subscribers.find((s: any) => s.email === "test@example.com")).toBeUndefined()
  })
})

describe("Form submissions (inscricoes)", () => {
  let submissionId: string

  test("GET /inscricoes returns empty list initially", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/inscricoes`)
    expect(status).toBe(200)
    expect(Array.isArray(data.inscricoes)).toBe(true)
  })

  test("POST /inscricoes submits a form (public)", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/inscricoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ana Silva", email: "ana@example.com", formId: "contact" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    submissionId = data.id
    expect(submissionId).toBeDefined()
  })

  test("submission appears in admin list", async () => {
    const { data } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/inscricoes`)
    const entry = data.inscricoes.find((i: any) => i.id === submissionId)
    expect(entry).toBeDefined()
    expect(entry.name).toBe("Ana Silva")
    expect(entry.submittedAt).toBeDefined()
  })

  test("DELETE removes submission", async () => {
    const { status, data } = await req(
      h.baseUrl, adminToken, "DELETE",
      `/sites/${SITE}/inscricoes?id=${submissionId}`,
    )
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: list } = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/inscricoes`)
    expect(list.inscricoes.find((i: any) => i.id === submissionId)).toBeUndefined()
  })
})
