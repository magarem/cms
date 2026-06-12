import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let token: string

beforeAll(async () => {
  h = await startServer()
  token = await login(h.baseUrl)
  // Seed a page and folder to operate on
  await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "original", title: "Original" })
  await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "to-rename", title: "Will Rename" })
  await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/folder`, { path: "target-folder" })
})

afterAll(() => stopServer(h))

describe("Tree — rename", () => {
  test("renames a page", async () => {
    const { status, data } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/rename`, {
      path: "to-rename",
      newName: "renamed",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: tree } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/tree`)
    const names = tree.tree.map((n: any) => n.name)
    expect(names).toContain("renamed")
    expect(names).not.toContain("to-rename")
  })

  test("rename to existing name returns 409", async () => {
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "conflict-a", title: "A" })
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "conflict-b", title: "B" })
    const { status } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/rename`, {
      path: "conflict-a",
      newName: "conflict-b",
    })
    expect(status).toBe(409)
  })
})

describe("Tree — duplicate", () => {
  test("duplicates a page in same directory", async () => {
    const { status, data } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/duplicate`, {
      path: "original",
      newName: "original-copia",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { status: readStatus } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=original-copia`)
    expect(readStatus).toBe(200)
  })

  test("duplicate to existing name returns 409", async () => {
    const { status } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/duplicate`, {
      path: "original",
      newName: "original-copia",
    })
    expect(status).toBe(409)
  })

  test("duplicate does not copy revision history", async () => {
    // Save original to create a revision
    const { data: page } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=original`)
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/page?path=original`, page.data)

    await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/duplicate`, {
      path: "original",
      newName: "original-no-history",
    })

    const { data: revs } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=original-no-history`)
    expect(revs.revisions).toHaveLength(0)
  })
})

describe("Tree — copy", () => {
  test("copies page to another folder", async () => {
    const { status, data } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/copy`, {
      path: "original",
      destination: "target-folder",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { status: readStatus } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=target-folder/original`)
    expect(readStatus).toBe(200)
  })
})

describe("Tree — move", () => {
  test("moves a page to another folder", async () => {
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "to-move", title: "Move Me" })
    const { status, data } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/move`, {
      path: "to-move",
      destination: "target-folder",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { status: readStatus } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=target-folder/to-move`)
    expect(readStatus).toBe(200)
    const { status: oldStatus } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=to-move`)
    expect(oldStatus).toBe(404)
  })
})

describe("Tree — delete node", () => {
  test("deletes a folder and its contents", async () => {
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/folder`, { path: "to-delete-folder" })
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "to-delete-folder/child", title: "Child" })

    const { status } = await req(h.baseUrl, token, "DELETE", `/sites/${SITE}/tree?path=to-delete-folder`)
    expect(status).toBe(200)

    const { data: tree } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/tree`)
    const names = tree.tree.map((n: any) => n.name)
    expect(names).not.toContain("to-delete-folder")
  })
})
