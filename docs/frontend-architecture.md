# Frontend Architecture

## Stack

| Technology | Version / Notes |
|------------|----------------|
| Nuxt | 4 (`compatibilityVersion: 4`) |
| NuxtUI | 3 |
| Vue | 3 (Composition API) |
| TypeScript | yes |
| Tailwind CSS | via NuxtUI |
| Drag & drop | `vue-draggable-plus` |
| SSR | disabled (`ssr: false`) — pure SPA |

---

## Directory Structure

```
cms/ui/
  nuxt.config.ts
  app/
    app.vue               # Root shell
    layouts/
      cms.vue             # Main CMS layout
      default.vue         # Bare layout (login, reset-password)
    pages/
      index.vue           # Auth redirect
      login.vue
      reset-password.vue
      [site]/
        index.vue         # Dashboard
        pages/
          [...slug].vue   # Page editor
        collections/
          [...slug].vue   # Collection editor
        models/
          index.vue       # Model list
          [name].vue      # Model editor
        media.vue
        global.vue
        settings.vue
        backups.vue
        assistant.vue
        users.vue
        newsletter.vue
        inscricoes.vue
        stats.vue
        preview.vue
    components/
      CmsTopbar.vue
      CmsFooter.vue
      MediaPanel.vue
      editor/
        BlockEditor.vue
        BlockCard.vue
        AddBlockModal.vue
        PropForm.vue
        PropField.vue
        MediaPicker.vue
      tree/
        PageTree.vue
        PageTreeSidebar.vue
        PageTreeSidebarNode.vue
      preview/
        PreviewTreeNode.vue
    composables/
      useApi.ts
      useAuth.ts
      useModels.ts
      useComponentSchema.ts
    middleware/
      auth.ts             # Redirects to login if not authenticated
```

---

## Layouts

### `cms.vue`
The main CMS layout. Contains:
- **`PageTreeSidebar`** — left sidebar with the content tree, site selector, navigation links
- **Main slot** — page content area (scrollable)

### `default.vue`
Minimal layout for unauthenticated pages (login, reset-password).

---

## Composables

### `useApi()`
Authenticated fetch wrapper using the site's JWT cookie.

```typescript
const api = useApi()

await api.get<ResponseType>('/sites/mysite/backups')
await api.post('/sites/mysite/page', { path: 'about', ... })
await api.put('/sites/mysite/settings', { activeEditionVersion: 'v2' })
await api.del('/sites/mysite/backups/backup-12345')
```

- Uses `credentials: 'include'` on all requests
- Throws on non-2xx responses (error includes `data` from response body)
- Base URL from `useRuntimeConfig().public.apiBase`
- Method is **`del`** not `delete` (JS reserved word)

### `useAuth()`
Auth state and methods.

```typescript
const { user, ready, fetchMe, login, logout } = useAuth()
```

- `user` — reactive ref of current user (null if not logged in)
- `ready` — boolean, true once initial auth check is done
- `fetchMe()` — calls `GET /auth/me`, updates `user`
- `login(site, username, password)` — calls `POST /auth/login`
- `logout()` — calls `POST /auth/logout`, clears `user`

### `useModels()`
Load and manage page models.

```typescript
const { models, fetchModels, saveModel, deleteModel, filterByTarget } = useModels()
```

### `useComponentSchema()`
Access component registry.

```typescript
const { blockComponents, componentGroups, getSchema, buildDefaultProps } = useComponentSchema()
```

---

## Key Components

### `CmsTopbar.vue`
Page header with:
- **`#breadcrumb`** slot — current location in the tree
- **`#actions`** slot — page-specific action buttons
- **Publish button** — admin only; triggers `POST /sites/:site/publish`
- **User menu** — shows username, logout

### `PageTreeSidebar.vue`
Left sidebar file-manager tree. Features:
- Expand/collapse folders
- Context menu: create page, create folder, create collection, rename, copy, move, delete
- Drag-and-drop to reorder siblings or move into folders
- Shows different icons for pages, collections, and folders

### `PageTreeSidebarNode.vue`
A single node in the tree. Handles:
- Click to navigate to page editor
- Right-click for context menu
- Inline rename (double-click)
- Drag handle

### `BlockEditor.vue`
List of blocks for a page. Uses `vue-draggable-plus` for drag-to-reorder.

### `PropField.vue`
Universal field input. Detects type from schema or value and renders the appropriate input.  
Imports `VueDraggable` for `object-array` type (repeatable rows).

### `MediaPicker.vue`
Inline popover media browser. Emits path(s) on selection.

---

## Routing

Nuxt file-based routing. Key route patterns:

| Route | Component |
|-------|-----------|
| `/` | `index.vue` → redirect |
| `/login` | `login.vue` |
| `/{site}` | `[site]/index.vue` (dashboard) |
| `/{site}/pages/about` | `[site]/pages/[...slug].vue` |
| `/{site}/collections/blog` | `[site]/collections/[...slug].vue` |
| `/{site}/media` | `[site]/media.vue` |
| `/{site}/backups` | `[site]/backups.vue` |
| `/{site}/settings` | `[site]/settings.vue` |

---

## Auth Guard

`middleware/auth.ts` runs on every navigation. If `user` is null and the route is not `/login` or `/reset-password`, it redirects to `/login?redirect={currentPath}`.

After login, the user is redirected to the original destination.

---

## Runtime Config

```typescript
// nuxt.config.ts
runtimeConfig: {
  public: {
    apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3002'
  }
}
```

Access in components:
```typescript
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
```

---

## Build

```bash
# Development
nuxt dev --port 3001

# Production
bunx nuxt build       # outputs to .output/
# Note: use 'bunx nuxt build' on server — 'nuxt' is not in PATH for SSH sessions
```

PM2 serves the built Nuxt server:
```
node /home/maga/dev/sirius-eco-system/cms/ui/.output/server/index.mjs
```
