import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let adminToken: string
let editorToken: string
let backupId: string

beforeAll(async () => {
  h = await startServer()
  adminToken  = await login(h.baseUrl, "admin")
  editorToken = await login(h.baseUrl, "editor")
})
afterAll(() => stopServer(h))

describe("backups", () => {
  test("GET /versions lists available versions and data dirs", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/versions`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(Array.isArray(r.data.versions)).toBe(true)
    expect(r.data.versions).toContain("v1")
    expect(Array.isArray(r.data.dataDirs)).toBe(true)
  })

  test("unauthenticated request returns 401", async () => {
    const r = await req(h.baseUrl, "bad-token", "GET", `/sites/${SITE}/backups`)
    expect(r.status).toBe(401)
  })

  test("backups list is empty initially", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/backups`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.backups).toHaveLength(0)
  })

  test("editor cannot create a backup", async () => {
    const r = await req(h.baseUrl, editorToken, "POST", `/sites/${SITE}/backups`, { label: "editor attempt" })
    expect(r.status).toBe(403)
  })

  test("admin creates a backup", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/backups`, { label: "test-backup" })
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)
    expect(r.data.backup.label).toBe("test-backup")
    expect(typeof r.data.backup.id).toBe("string")
    expect(typeof r.data.backup.size).toBe("number")
    expect(Array.isArray(r.data.backup.dirs)).toBe(true)
    expect(r.data.backup.dirs).toContain("v1")
    backupId = r.data.backup.id
  })

  test("backup appears in list (newest first)", async () => {
    const r = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/backups`)
    expect(r.data.backups.length).toBe(1)
    expect(r.data.backups[0].id).toBe(backupId)
    expect(r.data.backups[0].label).toBe("test-backup")
  })

  test("backup with no label still succeeds", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/backups`, {})
    expect(r.status).toBe(200)
    expect(r.data.backup.label).toBe("")
  })

  test("download backup returns a zip", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/backups/${backupId}/download`, {
      headers: { Cookie: `cms_token=${adminToken}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toContain(".zip")

    const buf = await res.arrayBuffer()
    // ZIP magic bytes: PK (0x50 0x4b)
    const bytes = new Uint8Array(buf)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  test("download non-existent backup returns 404", async () => {
    const res = await fetch(`${h.baseUrl}/sites/${SITE}/backups/no-such-id/download`, {
      headers: { Cookie: `cms_token=${adminToken}` },
    })
    expect(res.status).toBe(404)
  })

  test("restore backup restores files", async () => {
    // Modify a page, then restore the backup taken before the change
    await req(h.baseUrl, adminToken, "PUT", `/sites/${SITE}/page?path=home`, {
      title: "Modified After Backup",
      blocks: [],
    })

    const modified = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=home`)
    expect(modified.data.data.title).toBe("Modified After Backup")

    const restore = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/backups/${backupId}/restore`)
    expect(restore.status).toBe(200)
    expect(restore.data.success).toBe(true)
    expect(restore.data.restoredFrom.id).toBe(backupId)

    const after = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/page?path=home`)
    expect(after.data.data.title).toBe("Home")
  })

  test("restore non-existent backup returns 404", async () => {
    const r = await req(h.baseUrl, adminToken, "POST", `/sites/${SITE}/backups/no-such-id/restore`)
    expect(r.status).toBe(404)
  })

  test("editor cannot delete a backup", async () => {
    const r = await req(h.baseUrl, editorToken, "DELETE", `/sites/${SITE}/backups/${backupId}`)
    expect(r.status).toBe(403)
  })

  test("admin deletes a backup", async () => {
    const r = await req(h.baseUrl, adminToken, "DELETE", `/sites/${SITE}/backups/${backupId}`)
    expect(r.status).toBe(200)
    expect(r.data.success).toBe(true)

    const list = await req(h.baseUrl, adminToken, "GET", `/sites/${SITE}/backups`)
    expect(list.data.backups.some((b: any) => b.id === backupId)).toBe(false)
  })

  test("delete non-existent backup returns 404", async () => {
    const r = await req(h.baseUrl, adminToken, "DELETE", `/sites/${SITE}/backups/no-such-id`)
    expect(r.status).toBe(404)
  })
})
