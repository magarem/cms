import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string
let createdUserId: string

beforeAll(async () => {
  h = await startServer()
  adminToken = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
})

afterAll(() => stopServer(h))

describe("Users — list", () => {
  test("admin can list users", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "GET", `/users`)
    expect(status).toBe(200)
    expect(Array.isArray(data.users)).toBe(true)
    // passwordHash must never be exposed
    expect(data.users[0].passwordHash).toBeUndefined()
  })

  test("editor cannot list users", async () => {
    const { status } = await req(h.baseUrl, editorToken, "GET", `/users`)
    expect(status).toBe(403)
  })

  test("unauthenticated request returns 403", async () => {
    // usersRoutes uses getAuthedAdmin which returns 403 for non-admins including unauthenticated
    const { status } = await req(h.baseUrl, "", "GET", `/users`)
    expect(status).toBe(403)
  })
})

describe("Users — create", () => {
  test("admin creates a new user", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "POST", `/users`, {
      username: "newuser",
      password: "secure123",
      role: "editor",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBeDefined()
    createdUserId = data.user.id
  })

  test("new user can login", async () => {
    const token = await login(h.baseUrl, "newuser", "secure123")
    expect(token).toBeTruthy()
  })

  test("duplicate username returns 409", async () => {
    const { status } = await req(h.baseUrl, adminToken, "POST", `/users`, {
      username: "newuser",
      password: "other123",
      role: "editor",
    })
    expect(status).toBe(409)
  })
})

describe("Users — update", () => {
  test("admin changes user role", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "PUT", `/users/${createdUserId}`, {
      role: "viewer",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test("admin changes user password", async () => {
    const { status } = await req(h.baseUrl, adminToken, "PUT", `/users/${createdUserId}`, {
      password: "newpass456",
    })
    expect(status).toBe(200)
    // Verify new password works
    const token = await login(h.baseUrl, "newuser", "newpass456")
    expect(token).toBeTruthy()
  })
})

describe("Users — delete", () => {
  test("admin deletes a user", async () => {
    const { status, data } = await req(h.baseUrl, adminToken, "DELETE", `/users/${createdUserId}`)
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test("deleted user cannot login", async () => {
    const token = await login(h.baseUrl, "newuser", "newpass456")
    expect(token).toBe("")
  })
})
