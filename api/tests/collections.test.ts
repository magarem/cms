import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { startServer, stopServer, login, req, SITE, type ServerHandle } from "./helpers"

let h: ServerHandle
let token: string

beforeAll(async () => {
  h = await startServer()
  token = await login(h.baseUrl)
  // Create a collection
  await req(h.baseUrl, token, "POST", `/sites/${SITE}/tree/collection`, { path: "blog" })
})

afterAll(() => stopServer(h))

describe("Collections", () => {
  // Note: listCollectionItems always includes the collection's own _index as a cover item (isCover: true)
  const regularItems = (items: any[]) => items.filter((i: any) => !i.isCover)

  test("list has only the cover item initially (no real items)", async () => {
    const { status, data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/collection?path=blog`)
    expect(status).toBe(200)
    expect(regularItems(data.items)).toHaveLength(0)
  })

  test("POST creates a collection item", async () => {
    // Body uses collectionPath + slug (not path + name)
    const { status, data } = await req(h.baseUrl, token, "POST", `/sites/${SITE}/collection`, {
      collectionPath: "blog",
      slug: "first-post",
      title: "First Post",
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test("list returns the created item", async () => {
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/collection?path=blog`)
    expect(regularItems(data.items)).toHaveLength(1)
    expect(regularItems(data.items)[0].name).toBe("first-post")
  })

  test("creates a second item", async () => {
    await req(h.baseUrl, token, "POST", `/sites/${SITE}/collection`, {
      collectionPath: "blog",
      slug: "second-post",
      title: "Second Post",
    })
    const { data } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/collection?path=blog`)
    expect(regularItems(data.items)).toHaveLength(2)
  })

  test("PUT /collection/order reorders items", async () => {
    const { status, data } = await req(h.baseUrl, token, "PUT", `/sites/${SITE}/collection/order`, {
      path: "blog",
      order: ["second-post", "first-post"],
    })
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: list } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/collection?path=blog`)
    const items = regularItems(list.items)
    expect(items[0].name).toBe("second-post")
    expect(items[1].name).toBe("first-post")
  })

  test("collection item page is readable", async () => {
    const { status } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/page?path=blog/first-post`)
    expect(status).toBe(200)
  })

  test("DELETE removes a collection item", async () => {
    const { status, data } = await req(h.baseUrl, token, "DELETE", `/sites/${SITE}/collection?path=blog/first-post`)
    expect(status).toBe(200)
    expect(data.success).toBe(true)

    const { data: list } = await req(h.baseUrl, token, "GET", `/sites/${SITE}/collection?path=blog`)
    const items = regularItems(list.items)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe("second-post")
  })
})
