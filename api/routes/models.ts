import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import {
  listModels,
  getModel,
  saveModel,
  deleteModel,
  sanitizeName,
} from "../lib/models"
import { JWT_SECRET } from "../lib/config"

const ModelFieldSchema = t.Object(
  {
    name: t.String(),
    type: t.String(),
    label: t.Optional(t.String()),
    required: t.Optional(t.Boolean()),
    default: t.Optional(t.Any()),
    options: t.Optional(t.Array(t.Object({ value: t.Any(), label: t.String() }))),
    fields: t.Optional(t.Array(t.Any())),
  },
  { additionalProperties: true }
)

const BlockTemplateSchema = t.Object(
  {
    componentName: t.String(),
    isHero: t.Optional(t.Boolean()),
    label: t.Optional(t.String()),
    props: t.Optional(t.Record(t.String(), t.Any())),
  },
  { additionalProperties: true }
)

async function getUser(jwt: any, token: string | undefined, expectedSite?: string) {
  if (!token) return null
  const user = await jwt.verify(token) as any
  if (!user) return null
  if (expectedSite && user.site !== expectedSite) return null
  return user
}

export const modelsRoutes = new Elysia({ prefix: "/sites" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  // ── List models ──────────────────────────────────────────────
  .get("/:site/models", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    const models = await listModels(params.site)
    return { success: true, models }
  })

  // ── Get one model ────────────────────────────────────────────
  .get("/:site/models/:name", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site)
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    const model = await getModel(params.site, params.name)
    if (!model) { set.status = 404; return { error: "Modelo não encontrado." } }
    return { success: true, model }
  })

  // ── Create / update model ────────────────────────────────────
  .post(
    "/:site/models",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const { name, label, description, target, template, fields, blocks } = body
      const clean = sanitizeName(name)
      if (!clean) { set.status = 400; return { error: "Nome inválido." } }

      // Accept both new (top-level fields/blocks) and legacy (template.blocks) shapes
      const tplBlocks = Array.isArray(template?.blocks) ? template.blocks : undefined
      const saved = await saveModel(params.site, {
        name: clean,
        label: label || clean,
        description: description || "",
        target: target || "any",
        fields: Array.isArray(fields) ? fields : undefined,
        blocks: Array.isArray(blocks) ? blocks : tplBlocks,
      })
      return { success: true, model: saved }
    },
    {
      body: t.Object({
        name: t.String(),
        label: t.Optional(t.String()),
        description: t.Optional(t.String()),
        target: t.Optional(t.Union([t.Literal("page"), t.Literal("collection-item"), t.Literal("any")])),
        template: t.Optional(t.Object({ blocks: t.Optional(t.Array(t.Any())) }, { additionalProperties: true })),
        fields: t.Optional(t.Array(ModelFieldSchema)),
        blocks: t.Optional(t.Array(BlockTemplateSchema)),
      }),
    }
  )

  // ── Delete model ─────────────────────────────────────────────
  .delete("/:site/models/:name", async ({ params, cookie: { cms_token }, jwt, set }) => {
    const user = await getUser(jwt, cms_token?.value, params.site) as any
    if (!user) { set.status = 401; return { error: "Não autenticado." } }
    if (user.role !== "admin") { set.status = 403; return { error: "Apenas admins podem eliminar modelos." } }
    await deleteModel(params.site, params.name)
    return { success: true }
  })
