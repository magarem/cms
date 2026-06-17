# Authentication

## Overview

Auth is **JWT-based**, stored in an `httpOnly` cookie named `cms_token`. Every protected route calls `jwt.verify(token)` and checks that the token's `site` field matches the `:site` URL parameter.

---

## JWT Payload

```typescript
{
  id: string        // user UUID
  username: string
  role: "admin" | "editor" | "viewer"
  site: string      // which site this session belongs to
  iat: number
  exp: number       // set by @elysiajs/jwt (default 7d)
}
```

---

## Cookie

| Property | Value |
|----------|-------|
| Name | `cms_token` |
| httpOnly | true |
| SameSite | `Lax` (configurable via `COOKIE_SAMESITE` env) |
| Secure | true in production (configurable via `COOKIE_SECURE` env) |
| Path | `/` |

---

## Endpoints

### `POST /auth/login`
```json
// Request
{ "site": "mysite", "username": "admin", "password": "secret" }

// Response 200
{ "success": true, "user": { "id", "username", "role", "site" } }
// Sets cms_token cookie

// Response 401
{ "error": "Credenciais inválidas." }
```

**Special case — Root master credentials:**  
If `ROOT_USERNAME` and `ROOT_PASSWORD` env vars are set, they act as a super-admin that can log into any site. The JWT is issued with `role: "admin"` and the requested site.

### `POST /auth/logout`
Clears the `cms_token` cookie. Always returns `{ success: true }`.

### `GET /auth/me`
Returns the current authenticated user (reads JWT from cookie).  
Returns `401` if token is missing/invalid/expired.

### `POST /auth/forgot-password`
```json
// Request
{ "site": "mysite", "email": "user@example.com" }

// Response — always 200 (prevents user enumeration)
{ "success": true }
```
Generates a reset token (valid 1 hour), stores it on the user object, sends email via Resend.  
If `RESEND_API_KEY` is not set, logs the reset URL to stdout instead.

### `POST /auth/reset-password`
```json
// Request
{ "site": "mysite", "token": "jwt-reset-token", "password": "newpassword" }

// Response 200
{ "success": true }

// Response 400
{ "error": "Token inválido ou expirado." }
```

---

## Route-Level Auth Guard

Every protected route uses this pattern:

```typescript
async function getUser(jwt, token, expectedSite?) {
  if (!token) return null
  const user = await jwt.verify(token)
  if (!user) return null
  if (expectedSite && user.site !== expectedSite) return null
  return user
}

// In handler:
const user = await getUser(jwt, cms_token?.value, params.site)
if (!user) { set.status = 401; return { error: "Não autenticado." } }
```

---

## Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: create/delete pages, manage users, backups, publish |
| `editor` | Read + edit content, upload media |
| `viewer` | Read-only access |

Role checks are done inline per route:
```typescript
if (user.role !== "admin") { set.status = 403; return { error: "Sem permissão." } }
```

---

## Password Storage

Passwords are hashed with **bcrypt** (cost factor 10) via Bun's built-in `Bun.password`.

```typescript
// Hash
const hash = await Bun.password.hash(plain, { algorithm: "bcrypt", cost: 10 })

// Verify
const ok = await Bun.password.verify(plain, hash)
```

Stored in `storage/{site}/users.json` as `passwordHash` field.

---

## Users File

Each site has its own `storage/{site}/users.json`:

```json
[
  {
    "id": "uuid-v4",
    "username": "admin",
    "passwordHash": "$2b$10$...",
    "role": "admin",
    "email": "admin@example.com",
    "resetToken": null,
    "resetTokenExp": null
  }
]
```

If the file doesn't exist, `ensureUsersFile(site)` creates it with a random admin password printed to stdout.

---

## Password Reset Flow

1. User submits email via `POST /auth/forgot-password`
2. API finds user by email (if found), generates a short-lived JWT with `{ type: "reset" }`
3. Stores token + expiry on user record in `users.json`
4. Sends email with link: `{CMS_UI_URL}/reset-password?token=...&site=...`
5. User submits new password to `POST /auth/reset-password`
6. API verifies JWT + checks `type === "reset"` + not expired
7. Updates `passwordHash`, clears `resetToken` fields
