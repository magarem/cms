import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import bcrypt from "bcryptjs"
import { SITES_ROOT } from "./content"

function usersFile(site: string) {
  return join(SITES_ROOT, site, "users.json")
}

export interface User {
  id: string
  username: string
  passwordHash: string
  role: "admin" | "editor" | "viewer"
  sites: string[]
}

export async function readUsers(site: string): Promise<{ users: User[] }> {
  await ensureUsersFile(site)
  return JSON.parse(await readFile(usersFile(site), "utf-8"))
}

export async function writeUsers(site: string, data: { users: User[] }): Promise<void> {
  await mkdir(join(SITES_ROOT, site), { recursive: true })
  await writeFile(usersFile(site), JSON.stringify(data, null, 2))
}

async function ensureUsersFile(site: string) {
  const file = usersFile(site)
  if (existsSync(file)) return
  await mkdir(join(SITES_ROOT, site), { recursive: true })
  const hash = await bcrypt.hash("admin123", 10)
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
  console.log(`✅ Default admin user created for site "${site}": admin / admin123`)
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
