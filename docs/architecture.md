# Architecture

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| API framework | Elysia |
| Frontend framework | Nuxt 4 (`compatibilityVersion: 4`) |
| UI component library | NuxtUI 3 |
| Auth | JWT (via `@elysiajs/jwt`) |
| Storage | Plain filesystem (JSON, YAML, Markdown) |
| Image processing | sharp |
| AI generation | Anthropic Claude API |
| Stock images | Pexels API |
| Email | Resend API |
| Process manager | PM2 |
| Reverse proxy | Caddy |

---

## Monorepo Layout

```
sirius-eco-system/
  cms/
    api/          # Bun + Elysia REST API  → port 3002
    ui/           # Nuxt 4 SPA             → port 3001
  storage/        # All site content (one dir per site)
  sites/          # Site renderer apps (Nuxt, one per site or shared)
  admin/          # Orchestrator service   → port 3000
  docs/           # This documentation
```

---

## API Architecture

```
cms/api/
  index.ts          # Entry: creates Elysia app, mounts all routes, starts server
  routes/
    auth.ts         # /auth/* — login, logout, me, forgot/reset password
    sites.ts        # /sites/* — pages, tree, media, global, versions, publish, etc.
    users.ts        # /users/* — CRUD user management
    models.ts       # /sites/:site/models/* — page model CRUD
    agent.ts        # /sites/:site/agent/* — AI generation
    backups.ts      # /sites/:site/backups/* and /sites/:site/versions
  lib/
    config.ts       # JWT_SECRET and env validation
    content.ts      # File I/O, locking, tree building, all content operations
    users.ts        # User read/write/auth helpers
    models.ts       # Model read/write/apply helpers
    email.ts        # Password reset email via Resend
```

**Route mounting order in `index.ts`:**
```
authRoutes → sitesRoutes → modelsRoutes → usersRoutes → agentRoutes → backupsRoutes
```

**CORS** is configured for `CMS_UI_URL` (env) or `localhost:*` pattern in dev.

---

## Frontend Architecture

```
cms/ui/
  nuxt.config.ts      # ssr: false, @nuxt/ui module, apiBase runtimeConfig
  app/
    app.vue           # Root app shell
    layouts/
      cms.vue         # Main layout: sidebar (PageTreeSidebar) + main slot
      default.vue     # Minimal layout (for login/reset pages)
    pages/
      index.vue       # Auth redirect
      login.vue       # Login / forgot password
      reset-password.vue
      [site]/         # All CMS pages for a given site
    components/       # All reusable UI components
    composables/      # useApi, useAuth, useModels, useComponentSchema
```

The UI is a **pure SPA** (`ssr: false`). All pages under `[site]/` require authentication, enforced by `useAuth()` in a global middleware or per-page check.

---

## Request Flow

```
Browser → Caddy (TLS termination) → Nuxt UI (SSG shell) → JS fetches API
                                  → Elysia API → lib/content.ts → storage/
```

1. Browser loads the Nuxt SPA from `cms.siriusstudio.site`
2. SPA checks auth via `GET /auth/me` (using `cms_token` cookie)
3. API calls go to `api.siriusstudio.site` (proxied by Caddy to port 3002)
4. Cookie is `SameSite=Lax`, works across `*.siriusstudio.site` subdomains

---

## Data Flow

```
UI page → useApi() composable → fetch(apiBase + path, { credentials: 'include' })
       → Elysia route handler → lib/content.ts helpers → storage/{site}/{version}/...
```

All writes are protected by `withFileLock(path, fn)` — an in-process async mutex that prevents concurrent write corruption.

---

## Multi-Site Model

Each "site" is an independent directory in `storage/`. A single CMS instance serves all sites. Users are scoped per site — their JWT contains `{ site, username, role }`. The API always validates that the token's `site` matches the `:site` URL param.

---

## Production Server

- **IP**: `187.77.3.59`
- **PM2 processes**: `cms:api` (3002), `core:cms-ui` (3001), `core:admin` (3000)
- **Caddy**: `api.siriusstudio.site → :3002`, `cms.siriusstudio.site → :3001`
- **Storage**: `/home/maga/dev/sirius-eco-system/storage/`
