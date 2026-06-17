# Relatório de Estudo — Sirius Eco-System

**Data:** 2026-05-22
**Autor:** Claude (Opus 4.7)
**Âmbito:** Auditoria inicial de arquitetura, modelo de conteúdo, deploy e riscos.

---

## Visão geral

O **Sirius Eco-System** é uma plataforma multi-site composta por um **CMS headless** (autoria de conteúdo) + **renderer de sites** + **orquestrador admin**, construída sobre **Bun, Elysia, Nuxt 4, Vue 3 e NuxtUI 3**. Não usa base de dados: o conteúdo vive como YAML/JSON/Markdown em `storage/`, o que torna tudo portátil, versionável e fácil de migrar.

## Arquitetura (4 camadas)

| Camada | Porta | Stack | Função |
|---|---|---|---|
| **Admin** | 3000 | Nuxt 4 SSR + PrimeVue + nuxt-elysia | Orquestrador: cria/gere sites, reload Caddy, controlo PM2 |
| **CMS UI** | 3001 | Nuxt 4 SPA + NuxtUI 3 | Editor visual (blocos, drag-drop, media, users) — em pt-PT |
| **CMS API** | 3002 | Bun + Elysia 1.4 | REST: `/auth`, `/sites`, `/users`, `/models`, `/agent` |
| **Content API** | 3010 | Bun + Elysia | Leitura pública (consumida pelos sites) |
| **Sites web** | 3038+ | Nuxt 4 | Renderers individuais (paravyoma2, novagokula, …) |

Tudo atrás de **Caddy** (TLS automático) e gerido por **PM2** via `core.config.cjs` + `cms.config.cjs`.

**Fluxo:** Admin → reload Caddy; CMS UI ↔ CMS API ↔ `storage/{site}/{version}/` ← Content API ← Sites.

## Modelo de conteúdo

```
storage/{site}/
  users.json              # auth + roles (admin/editor/viewer)
  _settings.json          # versões ativas, edição corrente
  _models/                # schemas custom (per-site)
  v1/                     # versão editável
    _index.yml + _order.yml
    {page}/
      _index.yml          # blocks: [{id, componentName, isHero, props}]
      content.md          # corpo Markdown (se houver ContentMD)
      _collection.yml     # marca diretório como coleção
  production/             # snapshot publicado
```

- **Pages** = ficheiros YAML/JSON com array `blocks`
- **Collections** = diretórios marcados por `_collection.yml`
- **Ordem** = `_order.yml` (respeitada em `buildTree` e listagens)
- **Versionamento** nativo (v1/production) permite A/B e staged publishing

## Stack técnico

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Bun | latest |
| CMS API | Elysia | 1.4.28 |
| CMS UI | Nuxt | 4.4.2 |
| CMS UI | Vue | 3.5.32 |
| CMS UI | NuxtUI | 3.0.2 |
| Admin/Sites | Nuxt | 4.3.1–4.4.2 |
| Admin | PrimeVue | 4.5.4 |
| Auth | JWT (Elysia plugin) | 1.4.2 |
| Password | bcryptjs | 2.4.3 |
| Content parsing | gray-matter | 4.0.3 |
| YAML | js-yaml | 4.1.0 |
| Drag/drop | vue-draggable-plus | 0.6.0 |
| AI | @anthropic-ai/sdk | 0.96.0 |
| Proxy | Caddy | auto-TLS |
| Process mgmt | PM2 | ecosystem |

## Pontos fortes

1. **Simplicidade** — sem base de dados; conteúdo em ficheiros legíveis a humanos
2. **Composabilidade** — CMS UI, API e sites são processos independentes
3. **Modelagem de conteúdo rica** — Models + blocks + auto-inferência de campos no `PropField.vue`
4. **Multi-tenancy** real — users, storage e versões isolados por site, JWT com claim `site`
5. **Segurança razoável** — cookies httpOnly, body strict no Elysia, RBAC (admin/editor/viewer)
6. **Lib partilhada** — 37 componentes Vue em `sites/shared/` evitam duplicação entre sites
7. **Integração Claude** — endpoint `/agent` para assistência de conteúdo
8. **Deploy automatizado** — rsync + PM2 + Caddy reload

## Riscos e fragilidades

| # | Problema | Impacto |
|---|---|---|
| 1 | **Sem locking de ficheiros** — dois editores a gravar a mesma página → last-write-wins | Perda de dados silenciosa |
| 2 | **`JWT_SECRET` default `"sirius_cms_dev_secret_change_in_production"`** repetido em vários ficheiros | Risco crítico em produção |
| 3 | **Zero testes** — nenhum `*.test.ts` na source | Refactors são cegos |
| 4 | **Admin default `admin/admin123`** auto-criado se `users.json` faltar | Possível creds esquecidas em prod |
| 5 | **CORS `origin: true` + `credentials: true`** sem CSRF token | XSS pode escalar |
| 6 | **`body as any` em `models.ts`** contorna validação Elysia | Schemas malformados podem partir o editor |
| 7 | **Sem audit log** — quem editou o quê e quando? `_analytics/` existe mas não está usado | Sem rasto em conflitos |
| 8 | **Sem backup pré-publish** — publicação sobrescreve `production/` | Conteúdo antigo irrecuperável |
| 9 | **`resolvePageFile()` ordem de prioridade** (`.json` → `.yml` → flat → nested) frágil se site tem nomes misturados | Bugs estranhos |
| 10 | **JWT em memória no SPA** — refresh = logout | Pequeno atrito UX |

## Perguntas em aberto

1. Como é que o `admin/` reinicia processos PM2 — shell out ou API?
2. O que é o diretório `siriusstudio/` — app separada, ainda em uso?
3. Os diretórios legacy `content/` e `data/` em alguns sites devem ser migrados?
4. `sites/content-api` tem rate limiting ou whitelist de IPs?
5. Existe path para migrar schemas quando um campo muda de tipo (ex: `text` → `markdown`)?

## Impressão final

Está **muito bem desenhado para a escala atual** (poucos sites, equipa pequena de editores) e a escolha "filesystem-as-database" é coerente — facilita backup, debug e portabilidade. O salto para produção robusta exige sobretudo:

1. **Locking ou versionamento otimista nas escritas**
2. **Gestão de segredos automatizada**
3. **Cobertura de testes mínima nas rotas críticas** (`auth.ts`, `content.ts`, `sites.ts`)

O resto são polimentos.
