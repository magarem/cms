import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import bcrypt from "bcryptjs"
import { SITES_ROOT, withFileLock } from "./content"

function usersFile(site: string) {
  return join(SITES_ROOT, site, "users.json")
}

export interface User {
  id: string
  username: string
  passwordHash: string
  role: "admin" | "editor" | "viewer"
  sites: string[]
  email?: string
}

export async function readUsers(site: string): Promise<{ users: User[] }> {
  await ensureUsersFile(site)
  return JSON.parse(await readFile(usersFile(site), "utf-8"))
}

export async function writeUsers(site: string, data: { users: User[] }): Promise<void> {
  const file = usersFile(site)
  return withFileLock(file, async () => {
    await mkdir(join(SITES_ROOT, site), { recursive: true })
    await writeFile(file, JSON.stringify(data, null, 2))
  })
}

async function ensureUsersFile(site: string) {
  const file = usersFile(site)
  if (existsSync(file)) return
  return withFileLock(file, async () => {
    if (existsSync(file)) return  // re-check inside lock
    await mkdir(join(SITES_ROOT, site), { recursive: true })
    const password = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url")
    const hash = await bcrypt.hash(password, 10)
    await writeFile(
      file,
      JSON.stringify(
        {
          users: [
            {
              id: crypto.randomUUID(),
              username: "admin",
              passwordHash: hash,
              role: "admin",
              sites: ["*"],
            },
          ],
        },
        null,
        2
      )
    )
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  NOVO SITE: conta admin criada para "${site}"
║  Utilizador : admin
║  Password   : ${password}
║  ⚠️  Muda esta password após o primeiro login!
╚══════════════════════════════════════════════════════════╝
`)
  })
}

export async function findUser(site: string, username: string): Promise<User | undefined> {
  const { users } = await readUsers(site)
  return users.find((u) => u.username === username)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export function sanitizeUser(user: User) {
  const { passwordHash: _, ...safe } = user
  return safe
}
