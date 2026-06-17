# Deployment

## Server

| Property | Value |
|----------|-------|
| IP | `187.77.3.59` |
| User | `maga` |
| OS | Linux (Ubuntu) |
| Process manager | PM2 |
| Reverse proxy | Caddy |

---

## PM2 Processes

| Name | Port | Entry point |
|------|------|-------------|
| `core:admin` | 3000 | admin service |
| `core:cms-ui` | 3001 | `cms/ui/.output/server/index.mjs` |
| `cms:api` | 3002 | `cms/api/index.ts` (via Bun) |
| `cms:content-api` | — | content API service |

### Useful PM2 commands
```bash
pm2 list                          # status overview
pm2 logs cms:api --lines 50       # tail API logs
pm2 restart cms:api core:cms-ui   # restart both services
pm2 save                          # persist process list
```

---

## Caddy Configuration

Reverse proxy routes:

```
cms.siriusstudio.site  →  localhost:3001  (CMS UI)
api.siriusstudio.site  →  localhost:3002  (CMS API)
```

Caddy handles TLS automatically via Let's Encrypt.

---

## Environment Variables

### API (`cms/api`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | yes (prod) | dev fallback | Must be 32+ chars in production |
| `SIRIUS_STORAGE_ROOT` | no | `../../../storage` | Absolute path to storage root |
| `CMS_UI_URL` | yes (prod) | `http://localhost:3001` | CORS allowed origin |
| `PORT` | no | `3002` | API listen port |
| `NODE_ENV` | no | — | Set to `production` to enforce JWT secret length |
| `ANTHROPIC_API_KEY` | for AI | — | Claude API key |
| `PEXELS_API_KEY` | for AI | — | Pexels stock image API key |
| `RESEND_API_KEY` | for email | — | Resend email API key |
| `EMAIL_FROM` | for email | — | Sender email address |
| `ROOT_USERNAME` | optional | — | Master admin username (any site) |
| `ROOT_PASSWORD` | optional | — | Master admin password |
| `COOKIE_SAMESITE` | no | `Lax` | Cookie SameSite policy |
| `COOKIE_SECURE` | no | `true` if prod | Cookie Secure flag |

### UI (`cms/ui`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NUXT_PUBLIC_API_BASE` | yes (prod) | `http://localhost:3002` | API base URL |

---

## Deployment Steps

### Deploy CMS only (no site content)

```bash
# 1. Sync code to server (exclude storage and site content)
rsync -avz --exclude='node_modules' --exclude='.nuxt' --exclude='.output' \
  --exclude='storage/' --exclude='sites/' \
  /path/to/sirius-eco-system/ maga@187.77.3.59:/home/maga/dev/sirius-eco-system/

# 2. Fix permissions (rsync from Mac can create files owned by UID 501)
ssh maga@187.77.3.59 "sudo chown -R maga:maga /home/maga/dev/sirius-eco-system/cms/"

# 3. Install API dependencies
ssh maga@187.77.3.59 "cd /home/maga/dev/sirius-eco-system/cms/api && bun install"

# 4. Build CMS UI
# IMPORTANT: 'nuxt' is not in PATH for SSH sessions — must use full path via bunx
ssh maga@187.77.3.59 "cd /home/maga/dev/sirius-eco-system/cms/ui && /home/maga/.bun/bin/bunx nuxt build"

# 5. Restart services
ssh maga@187.77.3.59 "pm2 restart cms:api core:cms-ui"

# 6. Verify
ssh maga@187.77.3.59 "pm2 list"
```

---

## Sharp on the Server

`sharp` requires platform-specific native bindings. Common pitfall:

- **Problem**: Running a script from `/tmp/` uses Bun's global cache which lacks `linux-x64` bindings → `ERR_DLOPEN_FAILED`
- **Solution**: Run sharp-based scripts from `cms/api/` directory so Bun uses the project's own `node_modules/sharp`

```bash
# Wrong
cd /tmp && bun run convert.ts

# Correct
cp convert.ts /home/maga/dev/sirius-eco-system/cms/api/
cd /home/maga/dev/sirius-eco-system/cms/api && bun run convert.ts
```

---

## Local Development

```bash
# Terminal 1 — API
cd cms/api
bun --watch index.ts

# Terminal 2 — UI
cd cms/ui
nuxt dev --port 3001
```

The UI's `NUXT_PUBLIC_API_BASE` defaults to `http://localhost:3002`.

---

## Cookie Cross-Domain Notes

- Cookie is `SameSite=Lax` 
- Works between `cms.siriusstudio.site` (UI) and `api.siriusstudio.site` (API) because both are subdomains of `siriusstudio.site`
- Does **not** work cross-origin (different eTLD+1)

---

## Nuxt Build Notes

- Build output: `cms/ui/.output/`
- Server entry: `cms/ui/.output/server/index.mjs`
- Static assets: `cms/ui/.output/public/`
- After rebuild, PM2 restart is required (`pm2 restart core:cms-ui`)
- After deploy, users may need a **hard refresh** (Cmd/Ctrl+Shift+R) to clear cached JS bundles
