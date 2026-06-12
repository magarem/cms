import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let token: string

beforeAll(async () => {
  h = await startServer()
  token = await login(h.baseUrl)
  await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "rev-test", title: "Revision Test" })
})

afterAll(() => stopServer(h))

describe("Revisions", () => {
  test("list is empty before any save", async () => {
    const { status, data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    expect(status).toBe(200)
    expect(data.revisions).toHaveLength(0)
  })

  test("explicit save (no silent) creates a revision", async () => {
    const { data: page } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=rev-test`)
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/page?path=rev-test`, { ...page.data, title: "Rev 1" })

    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    expect(data.revisions).toHaveLength(1)
    expect(data.revisions[0].savedBy).toBe("admin")
  })

  test("auto-save (silent=true) creates first revision when history is empty", async () => {
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/page`, { path: "autosave-test", title: "AutoSave" })

    const { data: page } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=autosave-test`)
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/page?path=autosave-test&silent=true`, { ...page.data, title: "Auto v1" })

    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=autosave-test`)
    expect(data.revisions).toHaveLength(1)
  })

  test("second auto-save within 5 minutes does not create another revision", async () => {
    const { data: page } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=autosave-test`)
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/page?path=autosave-test&silent=true`, { ...page.data, title: "Auto v2" })

    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=autosave-test`)
    expect(data.revisions).toHaveLength(1) // still 1
  })

  test("revision metadata excludes data field", async () => {
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    expect(data.revisions[0].id).toBeDefined()
    expect(data.revisions[0].savedAt).toBeDefined()
    expect(data.revisions[0].savedBy).toBeDefined()
    expect(data.revisions[0].size).toBeDefined()
    expect(data.revisions[0].data).toBeUndefined()
  })

  test("GET revision detail includes full data", async () => {
    const { data: list } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    const revId = list.revisions[0].id
    const { status, data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions/${revId}?path=rev-test`)
    expect(status).toBe(200)
    expect(data.revision.data).toBeDefined()
    expect(typeof data.revision.data).toBe("object")
  })

  test("restore revision sets page to past state and snapshots current", async () => {
    // At this point rev-test has title "Rev 1" (the saved revision captures pre-save state)
    // Do a second save to change title
    const { data: page } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=rev-test`)
    await req(h.baseUrl, token, "PUT", `/sites/${SITE}/page?path=rev-test`, { ...page.data, title: "Rev 2" })

    const { data: list } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    const revCount = list.revisions.length
    const oldRevId = list.revisions[list.revisions.length - 1].id // oldest

    // Restore oldest revision
    const { status } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/page/revisions/${oldRevId}/restore?path=rev-test`)
    expect(status).toBe(200)

    // Revision count should have grown by 1 (restore snapshots current before writing)
    const { data: newList } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions?path=rev-test`)
    expect(newList.revisions.length).toBe(revCount + 1)
  })

  test("GET unknown revision returns 404", async () => {
    const { status } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page/revisions/rev-0000000000000?path=rev-test`)
    expect(status).toBe(404)
  })
})
