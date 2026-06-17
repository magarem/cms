# API Reference

This API process hosts two logically separate surfaces that share a single Bun/Elysia server:

1. **CMS API** — content management endpoints for end-user sites (auth, users, sites/pages/media, models, backups, AI agent, analytics, newsletter, forms).
2. **Control Panel / Billing API** — vendor-side admin endpoints used by the orchestrator and client portal (clients, invoices, products, payment links, email templates, WhatsApp status). These do not edit site content; they manage the agency's billing relationship with its clients.

Base URL:
- Dev: `http://localhost:3002`
- Prod: `https://api.siriusstudio.site`

## Authentication model

Two distinct cookies, both JWT (HS256, signed with `JWT_SECRET`):

| Cookie | Used by | Set by | Subject |
|---|---|---|---|
| `cms_token` | CMS API, plus `/admin/clients`, `/admin/products`, `/admin/settings` (root-only) | `POST /auth/login`, `POST /auth/cms-magic` | `{ id, username, role, sites: string[], site }` |
| `control_token` | Control Panel API (`/control/*`) | `POST /control/login` | `{ role: "control", iat }` |

Both cookies are `httpOnly`, `path=/`, `maxAge` 7 days. `SameSite` and `Secure` come from env (`COOKIE_SAMESITE`, `COOKIE_SECURE`).

### Roles (CMS)

- `admin` — full access to a site.
- `editor` — read/write content; cannot delete pages, collections, models, run backups, or create versions.
- `viewer` — read-only.
- `sites: ["*"]` on the JWT payload denotes a **root** account (from `ROOT_USERNAME`/`ROOT_PASSWORD` env). Root can access every site and the `/admin/*` endpoints.

### Notation used below

- **[admin]** — requires `role === "admin"`.
- **[editor+]** — requires `role !== "viewer"` (admin or editor).
- **[any-auth]** — any authenticated CMS user.
- **[root]** — requires `sites.includes("*")`.
- **[control]** — requires `control_token` cookie with `role === "control"`.
- **[public]** — no auth (some validate a magic-link/HMAC token instead).
- A trailing `?` on a field name means the field is `t.Optional(...)` in the Elysia schema.
- All responses are `application/json` unless explicitly marked otherwise.

---

# Health Check

```
GET /health
Response: { status: "ok", ts: string (ISO 8601) }
```

---

# CMS API

All CMS endpoints (except `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/cms-magic`, and three public submit endpoints noted below) require a valid `cms_token` cookie.

The user JWT contains a `site` field that pins the session to one site; CMS routes that take a `:site` URL param verify that `:site === user.site` (except the cross-site `GET /sites/`). Mismatches return 401.

## Auth — prefix `/auth`

### POST /auth/login
Sets the `cms_token` cookie on success.

- Auth: **[public]**
- Body: `{ site: string, username: string, password: string }` (all `minLength: 1`)
- Success: `{ success: true, user: { id, username, role, sites: string[], site, email? } }`
- Errors:
  - 404 `{ success: false, error: "Site não encontrado." }`
  - 401 `{ success: false, error: "Credenciais inválidas." }`
  - 403 `{ success: false, error: "Sem acesso a este site." }`

Special case: if `username`/`password` match `ROOT_USERNAME`/`ROOT_PASSWORD` env, a root JWT is issued with `id: "root"`, `role: "admin"`, `sites: ["*"]`.

### POST /auth/logout
Clears the cookie.

- Auth: **[public]**
- Body: none
- Response: `{ success: true }`

### GET /auth/me
Returns the decoded JWT payload.

- Auth: **[any-auth]**
- Response: `{ success: true, user: { id, username, role, sites, site, ... iat, exp } }`
- Error: 401 `{ error: "Não autenticado." }`

### POST /auth/forgot-password
Always returns success — never reveals whether the user/email exists. Sends a reset email if the user has one.

- Auth: **[public]**
- Body: `{ site: string, username: string }`
- Response: `{ success: true }`

### POST /auth/reset-password
Consumes a reset token (separate JWT secret = `JWT_SECRET + ":reset"`, `exp: 1h`).

- Auth: **[public]** (token-gated)
- Body: `{ token: string, password: string (minLength: 6) }`
- Response: `{ success: true }`
- Errors: 400 `"Token inválido ou expirado."` · 404 `"Utilizador não encontrado."`

### POST /auth/cms-magic
Exchanges a CMS magic-link token (issued by the client portal) for a `cms_token` session. The new session is `role: "editor"`, scoped to the single site embedded in the token.

- Auth: **[public]** (token-gated)
- Body: `{ token: string }`
- Response: `{ success: true, site: string }`
- Error: 403 `"Token inválido ou expirado."`

---

## Users — prefix `/users`

All endpoints **[admin]** within the calling user's site.

### GET /users/
- Response: `{ success: true, users: User[] }` where `User = { id, username, role, sites, email? }` (no `passwordHash`).
- Error: 403 `{ error: "Sem permissão." }`

### POST /users/
- Body:
  ```
  {
    username: string (minLength: 2),
    password: string (minLength: 6),
    role:     "admin" | "editor" | "viewer",
    email?:   string
  }
  ```
- Response: `{ success: true, user: User }`
- Errors: 403 · 409 `"Utilizador já existe."`

### PUT /users/:id
Body is `t.Any()` — only `role`, `password`, `email` keys are honoured.

- Body: `{ role?, password?, email? }`
- Response: `{ success: true, user: User }`
- Errors: 403 · 404 `"Utilizador não encontrado."`

### DELETE /users/:id
- Response: `{ success: true }`
- Errors: 403 · 404

---

## Sites — prefix `/sites`

### GET /sites/
Lists sites the user has access to (filtered by `user.sites`; root sees all).

- Auth: **[any-auth]** — note: this is the only `/sites` endpoint that does NOT enforce `user.site === :site` (it has no `:site` param).
- Response: `{ success: true, sites: [{ id: string, name: string }] }`
- Error: 401

### GET /sites/:site/tree
Full recursive content tree for the active edition version.

- Auth: **[any-auth]** for `:site`
- Response: `{ success: true, tree: TreeNode[], version: string }`
- `TreeNode` shape (from `buildTree`): `{ name, path, title?, type: "page" | "folder" | "collection", children?: TreeNode[], blocks?, isHero? }`.

### GET /sites/:site/settings
Reads `_settings.json` and `_cms.json`. Also reconciles `siteVersions` from on-disk directories.

- Auth: **[any-auth]**
- Response:
  ```
  {
    success: true,
    settings: {
      activeEditionVersion?: string,
      defaultSiteVersion?:   string,
      siteVersions:          string[],
      breadcrumbMode?:       string,
      blocksGap?:            string,
      siteUrl?:              string,
      siteTitle?:            string,
      lastPublished?:        string (ISO),
      publishedFrom?:        string,
      lastUpdated?:          string (ISO)
    },
    cmsConfig: object
  }
  ```

### PUT /sites/:site/settings
- Auth: **[editor+]**
- Body:
  ```
  {
    activeEditionVersion?: string,
    defaultSiteVersion?:   string,
    breadcrumbMode?:       string,
    blocksGap?:            string,
    siteUrl?:              string,
    cmsConfig?:            any   // overwrites _cms.json verbatim if present
  }
  ```
- Response: `{ success: true }`

### POST /sites/:site/versions
Creates a new edition version. Copies from `from` or from current active version (or `v1`). Reserved: `"production"`.

- Auth: **[admin]**
- Body: `{ name: string, from?: string }`
- Response: `{ success: true, version: string, versions: string[] }`
- Errors: 400 `"Nome de versão inválido."` / `"O nome 'production' é reservado."` · 409 `"A versão "X" já existe."`

### POST /sites/:site/publish
Copies the active edition version into `production/`. Does not change `activeEditionVersion`.

- Auth: **[admin]**
- Body: none
- Response: `{ success: true, publishedAt: string (ISO), from: string }`
- Error: 400 `"Versão de edição não encontrada."`

### GET /sites/:site/versions
Lists on-disk content version dirs and `_*` data dirs available for backup selection.

- Auth: **[any-auth]**
- Response: `{ success: true, versions: string[], dataDirs: string[] }`

### Tree

#### POST /sites/:site/tree/folder
- Auth: **[editor+]**
- Body: `{ path: string }`
- Response: `{ success: true }`
- Error: 409 `"Pasta já existe."`

#### POST /sites/:site/tree/collection
Creates a folder with `_collection.yml` (optionally `{ itemModel }`) and a stub `_index.yml` containing a single `ChildGrid` block.

- Auth: **[editor+]**
- Body: `{ path: string, title?: string, itemModel?: string }`
- Response: `{ success: true }`
- Error: 409 `"Coleção já existe."`

#### DELETE /sites/:site/tree
Recursively removes a tree node.

- Auth: **[admin]**
- Query: `path` (string)
- Response: `{ success: true }`

#### POST /sites/:site/tree/rename
Renames a node and updates the parent's `_order.yml` if it references the old name.

- Auth: **[editor+]**
- Body: `{ path: string, newName: string }`
- Response: `{ success: true }`
- Errors: 404 · 409

#### POST /sites/:site/tree/copy
- Auth: **[editor+]**
- Body: `{ path: string, destination: string }`
- Response: `{ success: true }`
- Errors: 404 · 409

#### POST /sites/:site/tree/duplicate
Duplicates a node under the same parent with a sanitised new name. Drops `_revisions/` on the copy.

- Auth: **[editor+]**
- Body: `{ path: string, newName: string }`
- Response: `{ success: true }`
- Errors: 404 · 409

#### POST /sites/:site/tree/move
Moves a node to a destination folder and optionally re-orders within it.

- Auth: **[editor+]**
- Body:
  ```
  {
    path:         string,
    destination:  string,
    position?:    "before" | "after" | "inside",
    referenceNode?: string
  }
  ```
- Response: `{ success: true }`
- Error: 404 / 409

### Pages

#### GET /sites/:site/page
- Auth: **[any-auth]**
- Query: `path` (string)
- Response: `{ success: true, data: PageData, ext: ".yml" | ".json", version: string }`
- `PageData` shape:
  ```
  {
    title:   string,
    layout:  string,
    model?:  string,
    image?:  string[],
    date?:   string,
    description?: string,
    blocks:  Array<{ id: string, componentName: string, isHero: boolean, props: object }>,
    ...any other front-matter fields
  }
  ```
- Error: 404 `"Página não encontrada."`

#### PUT /sites/:site/page
Overwrites the page file (body is the full `PageData`). Auto-checkpoints a revision: on explicit save always, on `silent=true` only if last revision >5 min old.

- Auth: **[editor+]**
- Query: `path` (string), `silent?` ("true" suppresses always-snapshot)
- Body: `any` (full PageData object)
- Response: `{ success: true }`

#### POST /sites/:site/page
Creates a new page from the resolved model (explicit → site default model → hard fallback). Writes `content.md` if the model requires it.

- Auth: **[editor+]**
- Body: `{ path: string, title?: string, model?: string }`
- Response: `{ success: true }`
- Error: 409 `"Página já existe."`

#### DELETE /sites/:site/page
- Auth: **[admin]**
- Query: `path` (string)
- Response: `{ success: true }`

#### GET /sites/:site/page/revisions
- Auth: **[any-auth]**
- Query: `path` (string)
- Response: `{ success: true, revisions: Array<{ id: string, savedAt: string (ISO), savedBy: string }> }`

#### GET /sites/:site/page/revisions/:revId
- Auth: **[any-auth]**
- Query: `path` (string)
- Response: `{ success: true, revision: { id, savedAt, savedBy, data: PageData } }`
- Error: 404 `"Revisão não encontrada."`

#### POST /sites/:site/page/revisions/:revId/restore
Snapshots the current page, then writes the revision content over it.

- Auth: **[editor+]**
- Query: `path` (string)
- Response: `{ success: true }`
- Error: 404

### Collections

#### GET /sites/:site/collection
- Auth: **[any-auth]**
- Query: `path` (string)
- Response:
  ```
  {
    success: true,
    items:   Array<{ name, path, title?, date?, image?, ... }>,
    collection: { itemModel?: string, ... }   // contents of _collection.yml
  }
  ```

#### POST /sites/:site/collection
Resolves model by: explicit `model` → collection's `itemModel` → hard fallback.

- Auth: **[editor+]**
- Body: `{ collectionPath: string, slug: string, title?: string, model?: string }`
- Response: `{ success: true, slug: string (full item path) }`
- Error: 409 `"Item já existe."`

#### DELETE /sites/:site/collection
- Auth: **[admin]**
- Query: `path` (full item path)
- Response: `{ success: true }`

#### PUT /sites/:site/collection/order
- Auth: **[editor+]**
- Body: `{ path: string, order: string[] }`
- Response: `{ success: true }`

### Markdown

#### GET /sites/:site/markdown
- Auth: **[any-auth]**
- Query: `path` (string — full file path within version, e.g. `about/content.md`)
- Response: `{ success: true, content: string }`
- Error: 404 `"Ficheiro não encontrado."`

#### PUT /sites/:site/markdown
- Auth: **[editor+]**
- Query: `path` (string)
- Body: `{ content: string }`
- Response: `{ success: true }`

### Global Data

#### GET /sites/:site/global
Reads every `_global/*.json|yml` file under the active version.

- Auth: **[any-auth]**
- Response:
  ```
  {
    success: true,
    global: Record<string, { data: object, ext: ".json" | ".yml" }>
  }
  ```

#### PUT /sites/:site/global/:key
Writes `_global/{key}.json` (or preserves `.yml` if already present). Body is the raw object.

- Auth: **[editor+]**
- Body: `any` (verbatim object)
- Response: `{ success: true }`

### Media

#### GET /sites/:site/media
- Auth: **[any-auth]**
- Query: `path?` (subfolder, defaults to root media dir)
- Response: `{ success: true, items: Array<{ name, path, type: "file" | "dir", size?, mtime? }> }`

#### GET /sites/:site/media/serve
Streams the raw file from disk (`Bun.file`).

- Auth: **[any-auth]**
- Query: `path` (string)
- Response: binary file or 404 JSON

#### POST /sites/:site/media/upload
Multipart upload. Auto-resizes images to max 1500×800 (inside, no upscale), converts non-PNG/SVG to WebP with quality step-down until <2MB, preserves PNG transparency.

- Auth: **[editor+]**
- Body (multipart): `file: File`, `path?: string` (subfolder)
- Response: `{ success: true, name: string }` — final filename after potential format change.

#### DELETE /sites/:site/media
- Auth: **[editor+]**
- Query: `path` (string)
- Response: `{ success: true }`

#### PUT /sites/:site/media/rename
- Auth: **[editor+]**
- Body: `{ path: string, newName: string }`
- Response: `{ success: true }`

#### PUT /sites/:site/media/move
- Auth: **[editor+]**
- Body: `{ path: string, destination: string }`
- Response: `{ success: true }`

#### PUT /sites/:site/media/copy
- Auth: **[editor+]**
- Body: `{ path: string }` — duplicates file in place with auto-suffix.
- Response: `{ success: true }`

### Components

#### GET /sites/:site/components
Reads the bundled UI component registry. Hides `cms_hidden: true` items unless `includeHidden=true`.

- Auth: **[any-auth]**
- Query: `includeHidden?` ("true" reveals hidden components)
- Response:
  ```
  {
    success: true,
    components: Array<{
      name: string,
      category: string,
      description: string,
      cms_hidden?: boolean,
      props: Array<{ name, type, required?, default?, options?, itemSchema?, fields? }>,
      ...
    }>,
    page_types: any[],
    fieldTypes: Record<string, any>
  }
  ```
- Error: 404 `"Registo de componentes não encontrado."`

### AI Agent

#### POST /sites/:site/agent/generate (in `agent.ts`)
Generates a page spec via Claude (tool-use), optionally enriches with Pexels images, and applies it.

- Auth: **[editor+]**
- Body: `{ prompt: string, dryRun?: boolean, model?: string (default "claude-sonnet-4-6") }`
- Response (dryRun):
  ```
  { success: true, dryRun: true, spec: { pages: PageSpec[] } }
  ```
- Response (apply):
  ```
  {
    success: boolean,
    spec:    { pages: PageSpec[] },
    results: Array<{
      path:   string,
      status: "created" | "updated" | "skipped" | "error",
      error?: string
    }>
  }
  ```
- `PageSpec`:
  ```
  {
    path:      string,
    title:     string,
    overwrite?: boolean,
    data?:     { layout?, description?, date?, ... },
    blocks:    Array<{ componentName: string, isHero?: boolean, props: object, imageHints?: Record<string, string|string[]> }>,
    markdown?: string
  }
  ```
- Errors: 400 `"Campo 'prompt' obrigatório."` · 500 `"ANTHROPIC_API_KEY não configurada."` / registry missing · 502 model errors.

#### POST /sites/:site/apply-spec (in `sites.ts`)
Batch page create/update — bypasses the AI call.

- Auth: **[editor+]**
- Body: `{ pages: PageSpec[] }` (no `imageHints` processing here)
- Response: `{ success: boolean, results: Array<{ path, status: "created"|"updated"|"skipped"|"error", error? }> }`
- Error: 400 `"Campo 'pages' é obrigatório e deve ser um array."`

#### GET /sites/:site/instagram-import
Scrapes Instagram's unofficial web_profile_info endpoint and returns up to 9 normalised posts.

- Auth: **[any-auth]**
- Query: `username` (string, required; `@` prefix accepted)
- Response:
  ```
  {
    items: Array<{
      src:   string,    // media URL on Instagram CDN
      type:  "video" | "image",
      title: string,
      description: string,
      category:    string,
      alt:   string
    }>,
    warning?: string
  }
  ```
- Errors: 400 missing username · 502 upstream failures.

### Models — prefix `/sites` (in `models.ts`)

#### GET /sites/:site/models
- Auth: **[any-auth]**
- Response: `{ success: true, models: Model[] }`

#### GET /sites/:site/models/:name
- Auth: **[any-auth]**
- Response: `{ success: true, model: Model }`
- Error: 404 `"Modelo não encontrado."`

#### POST /sites/:site/models
Create or replace a model.

- Auth: **[editor+]**
- Body:
  ```
  {
    name:         string,
    label?:       string,
    description?: string,
    target?:      "page" | "collection-item" | "any"   (default "any"),
    template?:    { blocks?: any[] }                   // legacy shape
    fields?:      Array<{
      name: string, type: string, label?: string,
      required?: boolean, default?: any,
      options?: Array<{ value: any, label: string }>,
      fields?: any[]
    }>,
    blocks?:      Array<{
      componentName: string,
      isHero?: boolean,
      label?: string,
      props?: Record<string, any>
    }>
  }
  ```
- Response: `{ success: true, model: Model }`
- Error: 400 `"Nome inválido."`

#### DELETE /sites/:site/models/:name
- Auth: **[admin]**
- Response: `{ success: true }`

### Backups — prefix `/sites` (in `backups.ts`)

#### GET /sites/:site/backups
- Auth: **[any-auth]**
- Response: `{ success: true, backups: BackupEntry[] }` (newest first)
- `BackupEntry`: `{ id: string, label: string, createdAt: string (ISO), size: number, dirs: string[] }`

#### POST /sites/:site/backups
Creates a backup of the listed dirs (or all of them if `dirs` is omitted/empty). Always includes `_settings.json`.

- Auth: **[admin]**
- Body: `{ label?: string, dirs?: string[] }`
- Response: `{ success: true, backup: BackupEntry }`
- Error: 400 `"Nenhuma pasta válida selecionada."`

#### POST /sites/:site/backups/upload
Uploads and extracts a ZIP, unwraps single-folder zips, strips `__MACOSX`.

- Auth: **[admin]**
- Body (multipart): `file: File` (must end in `.zip`)
- Response: `{ success: true, backup: BackupEntry }`
- Error: 400 invalid zip / empty.

#### GET /sites/:site/backups/:id/download
Streams a generated zip with `Content-Disposition: attachment`.

- Auth: **[any-auth]**
- Response: binary `application/zip` (filename `${label}-${id}.zip`)
- Error: 404

#### DELETE /sites/:site/backups/:id
- Auth: **[admin]**
- Response: `{ success: true }`
- Error: 404

#### POST /sites/:site/backups/:id/restore
Restores only the dirs recorded in the backup's manifest entry. Replaces matching destination dirs.

- Auth: **[admin]**
- Response: `{ success: true, restoredFrom: BackupEntry }`
- Error: 404

### Analytics & Forms (public submit + admin reads, in `sites.ts`)

#### POST /sites/:site/newsletter/subscribe — **[public]**
- Body: `any` (`{ email, name? }` honoured)
- Response: `{ success: true }`
- Error: 400 `"Email inválido."`

#### POST /sites/:site/inscricoes — **[public]**
Generic form submission collector. All extra body fields are stored alongside.

- Body: `any` (`email` required; `name`, `formId` extracted)
- Response: `{ success: true, id: string }`
- Error: 400 `"Email obrigatório."`

#### POST /sites/:site/analytics — **[public]**
Append-only pageview log (`_analytics/{YYYY-MM-DD}.jsonl`). Visitor hash = `sha256(ip|ua|date).slice(0,16)`.

- Body: `any` (`{ path?, ref?, ua?, ip? }` honoured)
- Response: `{ success: true }`

#### GET /sites/:site/newsletter
- Auth: **[any-auth]**
- Response: `{ subscribers: Array<{ email, name, subscribedAt }> }`

#### DELETE /sites/:site/newsletter
- Auth: **[any-auth]**
- Query: `email` (string, required)
- Response: `{ success: true }`
- Errors: 400 missing email · 404 list missing.

#### GET /sites/:site/inscricoes
- Auth: **[any-auth]**
- Response: `{ inscricoes: Array<{ id, submittedAt, name, email, formId, ... }> }`

#### DELETE /sites/:site/inscricoes
- Auth: **[editor+]**
- Query: `id` (string, validated by `t.Object({ id: t.String() })`)
- Response: `{ success: true }`
- Errors: 400 missing id · 404 not found.

#### GET /sites/:site/analytics
Aggregates JSONL logs into a dashboard payload.

- Auth: **[any-auth]**
- Query: `days?` (default 30, max 90)
- Response:
  ```
  {
    days:     Array<{ date: string, views: number, visitors: number }>,
    topPages: Array<{ path: string, views: number }>,   // top 10
    topRefs:  Array<{ ref: string,  views: number }>,   // top 10
    devices:  { desktop: number, mobile: number, tablet: number },
    totals:   { views: number, visitors: number }
  }
  ```

---

# Control Panel / Billing API

These endpoints power the agency-facing control panel (port 3004) and the client portal (port 3003). They share the API process but are NOT part of the CMS surface — they manage clients, invoices, products, payment links, and email/WhatsApp templates.

Authentication mixes three patterns:

- `/admin/*` paths use the **CMS** `cms_token` cookie but require `sites.includes("*")` (root).
- `/control/*` paths use a separate `control_token` cookie with `role: "control"` (single shared credential set via `CONTROL_USERNAME`/`CONTROL_PASSWORD` env).
- `/public/*` paths are unauthenticated but require a signed magic-link token (HMAC, see `lib/invoice-token`) in the `?token=` query string. The portal route `POST /public/portal/request-access` is unauthenticated and unconditional.

## Control auth — prefix `/control`

### POST /control/login
Validates against `CONTROL_USERNAME`/`CONTROL_PASSWORD` env. Sets `control_token` cookie.

- Auth: **[public]**
- Body: `{ username: string, password: string }`
- Response: `{ success: true }`
- Error: 401 `"Credenciais inválidas."`

### POST /control/logout
- Auth: **[public]**
- Response: `{ success: true }`

### GET /control/me
- Auth: **[control]**
- Response: `{ success: true, role: "control" }`

### GET /control/vendor
- Auth: **[control]**
- Response: `{ success: true, vendor: VendorProfile }` (see vendor schema below)

### GET /control/sites
Lists site dirs that exist under `SITES_ROOT` (excluding `_*`).

- Auth: **[control]**
- Response: `{ success: true, sites: Array<{ id: string, url: string, title: string }> }`

### POST /control/sites/create
Scaffolds a new site dir with `_settings.json`, empty `users.json`, `v1/_order.yml`. If `description` is provided and `ANTHROPIC_API_KEY` is set, also runs Claude tool-use to generate initial pages.

- Auth: **[control]**
- Body: `{ siteId: string, siteName?: string, description?: string }`
- Response: `{ success: true, site: string, generated: boolean, pages?: number, warning?: string }`
- Errors: 400 invalid id · 409 `"Já existe um site com esse ID."`

## Control — Products (`/control/products`)

In-memory data file `storage/_sirius/products.json`.

`Product`:
```
{
  id:          string,
  type:        "product" | "service",
  name:        string,
  description?: string,
  price:       number,
  unit?:       string,
  active:      boolean,
  createdAt:   string (ISO)
}
```

### GET /control/products — **[control]**
Response: `{ success: true, products: Product[] }`

### POST /control/products — **[control]**
- Body: `{ type: "product"|"service", name: string, description?, price: number, unit? }`
- Response: `{ success: true, product: Product }`

### PUT /control/products/:id — **[control]**
- Body: `{ type?, name?, description?, price?, unit?, active? }`
- Response: `{ success: true, product: Product }`
- Error: 404

### DELETE /control/products/:id — **[control]**
Response: `{ success: true }`

## Control — Clients (`/control/clients`)

Files live under `storage/_sirius/clients/`:
- `{id}.json` — profile
- `{id}-sites.json` — Array of `{ id, name?, url? }` (string-only entries are auto-normalised)
- `{id}-invoices.json` — Array of `Invoice`
- `{id}-support.json` — Array of `Ticket`

`ClientProfile`:
```
{ id: string, name: string, email?: string, phone?: string,
  address?: string, notes?: string, createdAt: string (ISO) }
```

`Invoice`:
```
{
  id:          string,                  // "inv-XXXXXXXX"
  description: string,
  items:       Array<{ label: string, amount: number }>,
  total:       number,
  status:      "pending" | "paid" | "overdue" | "cancelled",
  dueDate?:    string (ISO),
  paidAt?:     string (ISO),
  createdAt:   string (ISO),
  mpId?:       string,                  // Mercado Pago preference id
  paymentUrl?: string
}
```

`Ticket`:
```
{
  id:        string,                    // "tkt-XXXXXXXX"
  subject:   string,
  status:    "open" | "in_progress" | "resolved" | "closed",
  createdAt: string (ISO),
  messages:  Array<{ from: "admin" | "client", text: string, date: string (ISO) }>
}
```

### GET /control/clients — **[control]**
Response: `{ success: true, clients: Array<ClientProfile & { openTickets: number }> }`

### POST /control/clients — **[control]**
- Body: `{ name: string, email?, phone?, address?, notes? }`
- Response: `{ success: true, client: ClientProfile }`

### GET /control/clients/:id — **[control]**
Full hydrate.
- Response: `{ success: true, client: ClientProfile & { sites: SiteEntry[], invoices: Invoice[], support: Ticket[] } }`
- Error: 404 `"Cliente não encontrado."`

### PUT /control/clients/:id — **[control]**
- Body: `{ name?, email?, phone?, address?, notes? }`
- Response: `{ success: true, client: ClientProfile }`
- Error: 404

### DELETE /control/clients/:id — **[control]**
Removes profile + sites + invoices + support files.
Response: `{ success: true }`

### GET /control/clients/:id/portal-link — **[control]**
Generates a permanent (signed) portal magic-link.
- Response: `{ success: true, url: string }`

### POST /control/clients/:id/send-access-email — **[control]**
Emails the portal magic-link to the client.
- Response: `{ success: true }`
- Errors: 400 no email · 404 client missing.

#### Sites assignment

`SiteEntry = { id: string, name?: string, url?: string }`.

##### POST /control/clients/:id/sites — **[control]**
- Body: `{ siteId: string, name?: string|null, url?: string|null }`
- Response: `{ success: true, sites: SiteEntry[] }`

##### PATCH /control/clients/:id/sites/:siteId — **[control]**
- Body: `{ name?: string|null, url?: string|null }`
- Response: `{ success: true, sites: SiteEntry[] }`
- Error: 404 site not in client

##### DELETE /control/clients/:id/sites/:siteId — **[control]**
- Response: `{ success: true, sites: SiteEntry[] }`

#### Invoices (control)

##### POST /control/clients/:id/invoices — **[control]**
Auto-creates a Mercado Pago payment link unless status is `paid`/`cancelled` or total <= 0.
- Body:
  ```
  {
    description: string,
    items:       Array<{ label: string, amount: number }>,
    total:       number,
    status:      "pending" | "paid" | "overdue" | "cancelled",
    dueDate?:    string,
    paidAt?:     string
  }
  ```
- Response: `{ success: true, invoice: Invoice }`

##### PUT /control/clients/:id/invoices/:invoiceId — **[control]**
- Body: any subset of `{ description?, items?, total?, status?, dueDate?, paidAt? }`
- Response: `{ success: true, invoice: Invoice }`
- Error: 404

##### DELETE /control/clients/:id/invoices/:invoiceId — **[control]**
Response: `{ success: true }`

##### POST /control/clients/:id/invoices/:invoiceId/send-email — **[control]**
Response: `{ success: true }`
Errors: 400 missing email · 404 client/invoice.

##### POST /control/clients/:id/invoices/:invoiceId/send-whatsapp — **[control]**
Response: `{ success: true }`
Errors: 400 missing phone · 404.

##### POST /control/clients/:id/invoices/:invoiceId/generate-payment-link — **[control]**
Calls Mercado Pago and stores `mpId` + `paymentUrl` on the invoice.
- Response: `{ success: true, invoice: Invoice, paymentUrl: string }`
- Error: 502 on MP failure.

#### Support (control)

##### POST /control/clients/:id/support — **[control]**
- Body: `{ subject: string, message?: string }`
- Response: `{ success: true, ticket: Ticket }`

##### POST /control/clients/:id/support/:ticketId/reply — **[control]**
- Body: `{ text: string, from?: "admin" | "client" }` (defaults to `"admin"`)
- Response: `{ success: true, ticket: Ticket }`
- Error: 404

##### PUT /control/clients/:id/support/:ticketId — **[control]**
- Body: `{ status?: "open"|"in_progress"|"resolved"|"closed", subject?: string }`
- Response: `{ success: true, ticket: Ticket }`
- Error: 404

##### DELETE /control/clients/:id/support/:ticketId — **[control]**
Response: `{ success: true }`

## Control — Email templates (`/control/email-templates`)

Defaults are baked-in (`new_invoice`, `late_payment`, `last_warning`, `site_suspended`, `site_reactivated`, `portal_access`). Saved overrides live in `storage/_sirius/email-templates.json`.

`Template`:
```
{
  key:      string,
  name:     string,
  subject:  string,
  body:     string,    // {{var}} placeholders
  vars:     string[],
  isCustom: boolean
}
```

### GET /control/email-templates — **[control]**
Response: `{ success: true, templates: Template[] }`

### PUT /control/email-templates/:key — **[control]**
- Body: `{ subject: string, body: string }`
- Response: `{ success: true }`
- Error: 404 `"Template não encontrado."`

### DELETE /control/email-templates/:key — **[control]**
Removes the saved override (defaults take over again).
Response: `{ success: true }`

### POST /control/clients/:id/send-template-email — **[control]**
Renders a template with `{ clientName, vendorName, portalLink, invoiceId?, invoiceDescription?, total?, dueDate? }` and sends it.

- Body: `{ templateKey: string, invoiceId?: string }`
- Response: `{ success: true }`
- Errors: 400 invalid template / no client email · 502 send failure.

## Control — Mercado Pago webhook

### POST /control/webhooks/mercadopago — **[public]**
Receives a Mercado Pago `payment` event. If the referenced invoice (or `bulk`) is paid, marks the corresponding invoice(s) as `paid`.

- Body: Mercado Pago webhook payload (any).
- Response: `{ received: true }` (always 200).

## Vendor settings — prefix `/admin/settings` (uses `cms_token` + **[root]**)

`VendorProfile`:
```
{
  name?:    string,
  logo?:    string,     // filename under storage/_sirius/media/
  address?: string,
  phone?:   string,
  email?:   string,
  website?: string,
  taxId?:   string
}
```

### GET /admin/settings/vendor/media — **[public]**
Serves vendor media files (so logos load in PDFs/emails without auth).

- Query: `file` (string, basename only — `..` is stripped)
- Response: binary file
- Errors: 400 missing · 404 not found.

### GET /admin/settings/vendor — **[root]**
Response: `{ success: true, vendor: VendorProfile }`

### PUT /admin/settings/vendor — **[root]**
- Body: `VendorProfile` (all fields optional)
- Response: `{ success: true, vendor: VendorProfile }`

### GET /admin/settings/whatsapp/status — **[root]**
Calls the Z-API status endpoint.

- Response: `{ success: true, status: { connected: boolean, ... } }` on success, or `{ success: false, error: string }` on failure.

### POST /admin/settings/vendor/upload — **[root]**
Multipart upload for the vendor logo. Saves as `logo-{timestamp}{ext}` under `storage/_sirius/media/`.

- Body (multipart): `file: File`
- Response: `{ success: true, file: string (filename) }`

## Legacy admin endpoints (`/admin/clients`, `/admin/products` — root-only)

These are functionally similar to the `/control/*` versions but use the `cms_token` cookie with `sites.includes("*")` instead of the dedicated control session. Used by the orchestrator/admin UI when it already has a CMS root login.

### Clients — prefix `/admin/clients`

In this group `SiteEntry` is stored as plain strings (not the richer `{ id, name, url }` shape used by `/control`).

#### GET /admin/clients — **[root]**
Response: `{ success: true, clients: ClientProfile[] }`

#### POST /admin/clients — **[root]**
- Body: `{ name: string, email?, phone?, address?, notes? }`
- Response: `{ success: true, client: ClientProfile }`

#### GET /admin/clients/:id — **[root]**
- Response: `{ success: true, client: ClientProfile & { sites: string[], invoices: Invoice[], support: Ticket[] } }`
- Error: 404

#### PUT /admin/clients/:id — **[root]**
- Body: `{ name?, email?, phone?, address?, notes? }`
- Response: `{ success: true, client: ClientProfile }`

#### DELETE /admin/clients/:id — **[root]**
Response: `{ success: true }`

#### GET /admin/clients/:id/sites — **[root]**
Response: `{ success: true, sites: string[] }`

#### POST /admin/clients/:id/sites — **[root]**
- Body: `{ siteId: string }`
- Response: `{ success: true, sites: string[] }`

#### DELETE /admin/clients/:id/sites/:siteId — **[root]**
Response: `{ success: true, sites: string[] }`

#### GET /admin/clients/:id/invoices — **[root]**
Response: `{ success: true, invoices: Invoice[] }`

#### POST /admin/clients/:id/invoices — **[root]**
- Body: `{ description, items, total, status, dueDate?, paidAt? }` (same as control)
- Response: `{ success: true, invoice: Invoice }`
- Note: does NOT auto-create a Mercado Pago link (only the `/control` version does).

#### PUT /admin/clients/:id/invoices/:invoiceId — **[root]**
- Body: any subset of the same fields.
- Response: `{ success: true, invoice: Invoice }` · 404

#### DELETE /admin/clients/:id/invoices/:invoiceId — **[root]**
Response: `{ success: true }`

#### GET /admin/clients/:id/portal-link — **[root]**
Response: `{ success: true, url: string }`

#### POST /admin/clients/:id/invoices/:invoiceId/send-whatsapp — **[root]**
Response: `{ success: true }` · 400 / 404

#### POST /admin/clients/:id/invoices/:invoiceId/send-email — **[root]**
Response: `{ success: true }` · 400 / 404

#### GET /admin/clients/:id/support — **[root]**
Response: `{ success: true, tickets: Ticket[] }`

#### POST /admin/clients/:id/support — **[root]**
- Body: `{ subject: string, message?: string }`
- Response: `{ success: true, ticket: Ticket }`

#### POST /admin/clients/:id/support/:ticketId/reply — **[root]**
- Body: `{ text: string, from?: "admin"|"client" }`
- Response: `{ success: true, ticket: Ticket }`
- Error: 404

#### PUT /admin/clients/:id/support/:ticketId — **[root]**
- Body: `{ status?, subject? }`
- Response: `{ success: true, ticket: Ticket }`
- Error: 404

#### DELETE /admin/clients/:id/support/:ticketId — **[root]**
Response: `{ success: true }`

### Products — prefix `/admin/products`

Same data structure as `/control/products`, root-gated via `cms_token`.

#### GET /admin/products/ — **[root]**
Response: `{ success: true, products: Product[] }`

#### POST /admin/products/ — **[root]**
- Body: `{ type, name, description?, price, unit? }`
- Response: `{ success: true, product: Product }`

#### PUT /admin/products/:id — **[root]**
- Body: `{ type?, name?, description?, price?, unit?, active? }`
- Response: `{ success: true, product: Product }`
- Error: 404

#### DELETE /admin/products/:id — **[root]**
Response: `{ success: true }`

## Public client portal — prefix `/public`

All endpoints validate a `?token=` query string against the signed magic-link tokens in `lib/invoice-token`. There is no cookie session.

### GET /public/invoice/:clientId/:invoiceId — **[public, token]**
Accepts either an invoice-specific token or a client-wide token.

- Query: `token` (string)
- Response: `{ success: true, client: { name }, invoice: Invoice, vendor: VendorProfile }`
- Errors: 403 invalid token · 404 client/invoice.

### POST /public/portal/request-access — **[public]**
Looks up a client by email, emails them a portal magic-link. Always returns success.

- Body: `{ email: string }`
- Response: `{ success: true }`
- Error: 400 missing email.

### GET /public/client/:clientId — **[public, client token]**
Full portal payload.

- Query: `token` (client token)
- Response:
  ```
  {
    success:  true,
    client:   { name, email, phone, address },
    invoices: Invoice[],
    sites:    Array<{ id, name?, url?, cmsToken: string, cmsUrl: string }>,
    vendor:   VendorProfile
  }
  ```
- Error: 403 invalid token · 404 client.

`cmsToken` is a short-lived CMS magic token; the portal redirects the client to `cmsUrl?cmsToken=...` and the CMS UI exchanges it via `POST /auth/cms-magic`.

### PUT /public/client/:clientId/profile — **[public, client token]**
Lets the client update their own profile.

- Query: `token`
- Body: `{ name?: string, phone?: string, address?: string }`
- Response: `{ success: true, client: { name, email, phone, address } }`
- Error: 403 / 404

### GET /public/client/:clientId/support — **[public, client token]**
- Query: `token`
- Response: `{ success: true, tickets: Ticket[] }`

### POST /public/client/:clientId/support — **[public, client token]**
- Query: `token`
- Body: `{ subject: string, message?: string }`
- Response: `{ success: true, ticket: Ticket }`

### POST /public/client/:clientId/support/:ticketId/reply — **[public, client token]**
- Query: `token`
- Body: `{ text: string }` (always recorded as `from: "client"`)
- Response: `{ success: true }`
- Error: 404

### POST /public/client/:clientId/bulk-payment-link — **[public, client token]**
Creates a single Mercado Pago link for the sum of all `pending` + `overdue` invoices.

- Query: `token`
- Body: none
- Response: `{ success: true, paymentUrl: string, total: number }`
- Errors: 400 no open invoices · 502 MP failure.

### PUT /public/client/:clientId/cms-password — **[public, client token]**
Sets/updates the client's editor account on **each** site assigned to them. Username is `profile.email` (or `cliente-{clientId}` if no email).

- Query: `token`
- Body: `{ password: string (minLength: 6) }`
- Response: `{ success: true, username: string, cmsUrl: string, sites: string[] }`
- Errors: 400 no sites · 404 client missing.

---

# Error response shape

Every error response is JSON:

```
{ "error": "Mensagem de erro em português." }
```

Some auth endpoints additionally include `success: false`. Standard HTTP codes:

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error / missing required param |
| 401 | Not authenticated (missing/invalid token) |
| 403 | Authenticated but insufficient role / wrong site |
| 404 | Resource not found |
| 409 | Conflict (already exists) |
| 500 | Server error / missing env config |
| 502 | Upstream failure (Anthropic, Mercado Pago, Z-API, Instagram) |

---

# Notes

## Elysia strict body validation
Bodies typed with `t.Object({...})` are **strict** — extra fields produce a 400. Use the exact field set listed for each endpoint. Endpoints with `body: t.Any()` accept any object.

## JWT cookies
- `cms_token` is set on `/auth/login` and `/auth/cms-magic`; cleared on `/auth/logout`. The JWT subject embeds `{ id, username, role, sites, site }`. Routes that take a `:site` URL param enforce `user.site === :site`.
- `control_token` is set on `/control/login` only; subject is `{ role: "control", iat }`.
- Reset tokens (for `/auth/reset-password`) use a separate secret derived from `JWT_SECRET + ":reset"`, with `exp: 1h`.
- Magic-link tokens (`/public/*`, `/auth/cms-magic`) are HMACs from `lib/invoice-token` — not JWTs.

## Environment variables consumed
- `PORT` (default 3002)
- `CMS_UI_URL`, `PORTAL_URL`, `CONTROL_URL` — CORS allowlist and link generation
- `NODE_ENV` — when `"production"`, CORS drops the `localhost:*` wildcard and cookies prefer secure
- `COOKIE_SAMESITE` (`lax`|`strict`|`none`), `COOKIE_SECURE` (`"true"` to force)
- `JWT_SECRET` — signs `cms_token`, `control_token`, and reset tokens
- `ROOT_USERNAME`, `ROOT_PASSWORD` — bypass login as root
- `CONTROL_USERNAME`, `CONTROL_PASSWORD` — credentials for `/control/login`
- `ANTHROPIC_API_KEY` — required for AI agent + AI-assisted site scaffold
- `PEXELS_API_KEY` — enables Pexels image enrichment in `/sites/:site/agent/generate`
- Z-API credentials (in `lib/whatsapp`) — `whatsapp/status`, WhatsApp invoice sends
- Mercado Pago credentials (in `lib/mercadopago`) — payment link creation + webhook verification
- Email credentials (in `lib/email`) — portal access / invoice / template email sends

## Cookies & cross-site safety
For CMS routes that take a `:site` URL parameter, the handler verifies `user.site === :site`. This prevents a user with a valid `cms_token` for site A from reading site B by tweaking the URL. The only CMS endpoint that intentionally crosses sites is `GET /sites/` (it lists every site the user is allowed to see based on `user.sites`).

## Storage layout reminder
All on-disk data lives under `storage/` (also referred to in code as `SITES_ROOT`):

```
storage/
  {site}/
    users.json
    _settings.json
    _cms.json
    _backups/
      _manifest.json
      backup-{ts}/
    _newsletter/subscribers.json
    _inscricoes/inscricoes.json
    _analytics/{YYYY-MM-DD}.jsonl
    {version}/                  # v1, production, ...
      _order.yml
      _global/*.{json,yml}
      media/...
      {page}/
        _index.{yml,json}
        content.md
        _order.yml
        _revisions/{rev}.json
        _collection.yml         # presence = collection
  _sirius/                      # vendor + clients + products (control-panel data)
    vendor.json
    products.json
    email-templates.json
    media/
    clients/
      {clientId}.json
      {clientId}-sites.json
      {clientId}-invoices.json
      {clientId}-support.json
```
