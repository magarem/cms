# Users

## Overview

Users are **per-site** — each site has its own `users.json`. A user account is valid only for the site it belongs to. The JWT issued on login binds the user to that site.

---

## User Schema

```typescript
interface User {
  id: string            // UUID v4
  username: string      // unique within the site
  passwordHash: string  // bcrypt hash
  role: "admin" | "editor" | "viewer"
  email?: string        // optional; used for password reset
  resetToken?: string   // JWT for password reset (temporary)
  resetTokenExp?: number // Unix timestamp expiry
}
```

Stored in `storage/{site}/users.json` as a JSON array.

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access: manage users, publish, create/delete pages, backups |
| `editor` | Read + edit content, upload media; cannot manage users or publish |
| `viewer` | Read-only; cannot edit anything |

Role is embedded in the JWT on login and checked per route.

---

## API Endpoints

All endpoints require `admin` role.

### List users
```
GET /users
→ { users: User[] }   ← passwordHash excluded from response
```

### Create user
```
POST /users
{ "username": "joana", "password": "secret", "role": "editor", "email": "joana@site.com" }
→ { success: true, user: User }
```
- Validates unique username within the site
- Hashes password with bcrypt (cost 10)
- Assigns UUID v4

### Update user
```
PUT /users/:id
{ "role": "admin", "password": "newpass", "email": "new@email.com" }
```
- All fields optional
- If `password` is provided, re-hashes it

### Delete user
```
DELETE /users/:id
```

---

## Auto-Init

`ensureUsersFile(site)` in `lib/users.ts` is called whenever a site is accessed for the first time. If `users.json` doesn't exist, it creates one with a single `admin` user with a random 16-char password printed to stdout:

```
╔══════════════════════════════════════════════════════════╗
║  New site: mysite — Admin account created                ║
║  Username : admin                                        ║
║  Password : 4vjoSDcV4m9G4f9xhFlmXEH1                    ║
║  ⚠️  Muda esta password após o primeiro login!           ║
╚══════════════════════════════════════════════════════════╝
```

---

## Root Master Account

If `ROOT_USERNAME` and `ROOT_PASSWORD` environment variables are set, these credentials work as a super-admin for **any** site. The issued JWT has `role: "admin"` and the requested site. This is useful for initial setup and emergencies.

---

## UI — `users.vue`

- Shows a table of all users for the current site
- Admin can create, edit (role/password/email), and delete users
- Own account can change its own password (but not its own role)
- Confirmation dialog before delete
- Portuguese (pt-PT) labels throughout

---

## `lib/users.ts` Helpers

| Function | Purpose |
|----------|---------|
| `readUsers(site)` | Load `users.json` |
| `writeUsers(site, data)` | Save `users.json` with file lock |
| `ensureUsersFile(site)` | Create with random admin if missing |
| `findUser(site, username)` | Find user by username |
| `verifyPassword(plain, hash)` | `Bun.password.verify` |
| `hashPassword(plain)` | `Bun.password.hash` (bcrypt, cost 10) |
| `sanitizeUser(user)` | Remove `passwordHash` for API responses |
