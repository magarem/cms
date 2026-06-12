import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import bcrypt from "bcryptjs"

export const API_DIR = join(import.meta.dir, "..")
export const SITE = "testsite"
export const ADMIN_PASS = "testpass"
export const EDITOR_PASS = "testpass"

export interface ServerHandle {
  baseUrl: string
  testRoot: string
  proc: ReturnType<typeof Bun.spawn>
}

export async function createTestSite(root: string, site: string) {
  const siteDir = join(root, site)
  await mkdir(join(siteDir, "v1", "home"), { recursive: true })

  // cost=4 for speed in tests
  const hash = await bcrypt.hash(ADMIN_PASS, 4)

  await writeFile(join(siteDir, "users.json"), JSON.stringify({
    users: [
      { id: "admin-id", username: "admin", passwordHash: hash, role: "admin", email: "admin@test.com", sites: ["*"] },
      { id: "editor-id", username: "editor", passwordHash: hash, role: "editor", sites: [site] },
      { id: "viewer-id", username: "viewer", passwordHash: hash, role: "viewer", sites: [site] },
    ],
  }))

  await writeFile(join(siteDir, "_settings.json"), JSON.stringify({
    activeEditionVersion: "v1",
    defaultSiteVersion: "v1",
    siteVersions: ["v1"],
  }))

  await writeFile(join(siteDir, "v1", "home", "_index.yml"), "title: Home\nblocks: []\n")
}

let _portCounter = 4100

export async function startServer(): Promise<ServerHandle> {
  const port = _portCounter++
  const testRoot = await mkdtemp(join(tmpdir(), "sirius-test-"))
  await createTestSite(testRoot, SITE)

  // Use full path so it works in non-interactive SSH sessions where ~/.bun/bin isn't in $PATH
  const bunBin = process.execPath  // the bun binary that's running this test
  const proc = Bun.spawn([bunBin, "index.ts"], {
    cwd: API_DIR,
    env: { ...process.env, SIRIUS_STORAGE_ROOT: testRoot, PORT: String(port), NODE_ENV: "test" },
    stdout: "ignore",
    stderr: "ignore",
  })

  const baseUrl = `http://localhost:${port}`

  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${baseUrl}/health`)
      if (r.ok) break
    } catch { /* not ready yet */ }
    await Bun.sleep(150)
  }

  return { baseUrl, testRoot, proc }
}

export async function stopServer(h: ServerHandle) {
  h.proc.kill()
  await rm(h.testRoot, { recursive: true, force: true })
}

export async function login(baseUrl: string, username = "admin", password = ADMIN_PASS): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site: SITE, username, password }),
  })
  const setCookie = res.headers.get("set-cookie") ?? ""
  return setCookie.match(/cms_token=([^;]+)/)?.[1] ?? ""
}

export function authHeaders(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Cookie: `cms_token=${token}` }
}

export async function req(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: authHeaders(token),
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}
