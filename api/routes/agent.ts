import { Elysia, t } from "elysia"
import { jwt } from "@elysiajs/jwt"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import {
  SITES_ROOT,
  getSiteSettings,
  getActiveVersion,
  buildTree,
  resolvePageFile,
  writePage,
} from "../lib/content"
import { JWT_SECRET } from "../lib/config"

async function getUser(jwt: any, token: string | undefined, expectedSite?: string) {
  if (!token) return null
  const user = await jwt.verify(token) as any
  if (!user) return null
  if (expectedSite && user.site !== expectedSite) return null
  return user
}

// ── Pexels ───────────────────────────────────────────────────
async function fetchAndSaveImages(
  keywords: string | string[],
  pexelsKey: string,
  mediaDir: string
): Promise<string[]> {
  const kwArray = Array.isArray(keywords) ? keywords : [keywords]
  const results: string[] = []

  for (const keyword of kwArray) {
    try {
      const query = encodeURIComponent(keyword)
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
        { headers: { Authorization: pexelsKey } }
      )
      if (!res.ok) continue
      const data = await res.json() as any
      const photo = data.photos?.[0]
      if (!photo) continue

      const url = photo.src.large2x || photo.src.large
      const imgRes = await fetch(url)
      if (!imgRes.ok) continue

      await mkdir(mediaDir, { recursive: true })
      const filename = `pexels-${photo.id}.jpg`
      await writeFile(join(mediaDir, filename), Buffer.from(await imgRes.arrayBuffer()))
      results.push(`media/ai/${filename}`)
    } catch { /* skip on individual error */ }
  }

  return results
}

async function fillSpecImages(
  spec: { pages: any[] },
  pexelsKey: string,
  mediaDir: string
): Promise<{ pages: any[] }> {
  for (const page of spec.pages) {
    for (const block of page.blocks ?? []) {
      const hints = block.imageHints as Record<string, string | string[]> | undefined
      if (!hints) continue

      for (const [propName, keywords] of Object.entries(hints)) {
        const paths = await fetchAndSaveImages(keywords, pexelsKey, mediaDir)
        if (paths.length === 0) continue
        block.props[propName] = Array.isArray(keywords) ? paths : paths[0]
      }

      delete block.imageHints
    }
  }
  return spec
}

// ── Prompts & tool ───────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert web designer and CMS content architect for the Sirius CMS platform.

Your job: given a description of a website, produce a complete page structure with blocks and realistic content.

## Component Registry
Each block has a \`componentName\` (must be exact), \`isHero\` (true only for the first above-the-fold block on a page), and \`props\` (keys must match the component's prop names exactly).

## Rules
- Only use components from the registry provided. Never invent component names.
- Generate realistic, specific content — no "Lorem ipsum", no placeholders like "[Your Name]".
- All text content should match the language/locale of the site description.
- The home page must use path "" (empty string).
- Slugs: lowercase, hyphens only (e.g. "about", "services/design").
- For ContentMD blocks, always set pagePath to the same value as the page path.
- Pages that need rich text content should include a "markdown" field with real content.
- Blocks appear in visual order top-to-bottom on the page.
- Do not add blocks with missing required props.
- The "overwrite" field defaults to false — only set true if replacing existing content.

## Images (imageHints)
For blocks with image or image-array props, add an \`imageHints\` sibling object to the block:
- Single image prop (type "image"): value is ONE descriptive English search keyword, e.g. \`"image": "coffee shop interior warm light"\`
- Image-array prop (type "image-array"): value is an ARRAY of keywords — one per image desired, e.g. \`"slides": ["coffee bar counter", "barista espresso", "cozy cafe window"]\`
Leave imageHints empty ({}) for blocks that don't need real photos.
English keywords give the best Pexels results regardless of the site language.

## Output format
You MUST call the \`submit_spec\` tool with the complete spec. Do not output plain text.`

function buildUserPrompt(
  userPrompt: string,
  registry: any,
  tree: any[],
  siteName: string
): string {
  const componentSummary = (registry.components || [])
    .filter((c: any) => !c.cms_hidden)
    .map((c: any) => {
      const props = (c.props || []).map((p: any) => {
        let desc = `  - ${p.name} (${p.type})`
        if (p.required) desc += " [required]"
        if (p.default !== undefined && p.default !== "") desc += ` default: ${JSON.stringify(p.default)}`
        if (p.options) desc += ` options: [${p.options.map((o: any) => o.value).join(", ")}]`
        if (p.itemSchema) desc += `\n    items: ${JSON.stringify(p.itemSchema.map((s: any) => s.name))}`
        if (p.fields) desc += `\n    fields: ${JSON.stringify(p.fields.map((f: any) => f.name))}`
        return desc
      }).join("\n")
      return `### ${c.name} (${c.category})\n${c.description}\nProps:\n${props}`
    }).join("\n\n")

  const treeStr = tree.length
    ? `Existing pages:\n${JSON.stringify(tree, null, 2)}`
    : "Site is empty — create all pages from scratch."

  return `Site name: ${siteName}
${treeStr}

## Available Components
${componentSummary}

## User Request
${userPrompt}`
}

const submitSpecTool: Anthropic.Tool = {
  name: "submit_spec",
  description: "Submit the complete site spec to be applied to the CMS.",
  input_schema: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description: "List of pages to create or update.",
        items: {
          type: "object",
          required: ["path", "title", "blocks"],
          properties: {
            path:     { type: "string" },
            title:    { type: "string" },
            overwrite:{ type: "boolean" },
            data: {
              type: "object",
              properties: {
                layout:      { type: "string", enum: ["default", "post", "topbar-glass", "landing"] },
                description: { type: "string" },
                date:        { type: "string" },
              },
            },
            blocks: {
              type: "array",
              items: {
                type: "object",
                required: ["componentName", "props"],
                properties: {
                  componentName: { type: "string" },
                  isHero:        { type: "boolean" },
                  props:         { type: "object" },
                  imageHints: {
                    type: "object",
                    description: "Search keywords for image props. Single image: string value. Image-array: array of strings.",
                    additionalProperties: {
                      oneOf: [
                        { type: "string" },
                        { type: "array", items: { type: "string" } },
                      ],
                    },
                  },
                },
              },
            },
            markdown: { type: "string" },
          },
        },
      },
    },
    required: ["pages"],
  },
}

// ── Route ────────────────────────────────────────────────────
export const agentRoutes = new Elysia({ prefix: "/sites" })
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))

  .post(
    "/:site/agent/generate",
    async ({ params, body, cookie: { cms_token }, jwt, set }) => {
      const user = await getUser(jwt, cms_token?.value, params.site) as any
      if (!user) { set.status = 401; return { error: "Não autenticado." } }
      if (user.role === "viewer") { set.status = 403; return { error: "Sem permissão." } }

      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { set.status = 500; return { error: "ANTHROPIC_API_KEY não configurada." } }

      const { prompt, dryRun = false, model = "claude-sonnet-4-6" } = body as any
      if (!prompt?.trim()) { set.status = 400; return { error: "Campo 'prompt' obrigatório." } }

      const registryPath = join(import.meta.dir, "..", "ui", "app", "data", "components.json")
      if (!existsSync(registryPath)) { set.status = 500; return { error: "Registo de componentes não encontrado." } }
      const registry = JSON.parse(await readFile(registryPath, "utf-8"))

      const settings = await getSiteSettings(params.site)
      const version  = getActiveVersion(settings)
      const tree     = await buildTree(params.site, version)

      const anthropic  = new Anthropic({ apiKey })
      const userMessage = buildUserPrompt(prompt, registry, tree, params.site)

      let spec: { pages: any[] } | null = null
      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: [submitSpecTool],
          tool_choice: { type: "any" },
          messages: [{ role: "user", content: userMessage }],
        })

        const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        if (!toolUse || toolUse.name !== "submit_spec") {
          set.status = 502; return { error: "O modelo não devolveu uma especificação válida." }
        }
        spec = toolUse.input as { pages: any[] }
      } catch (err: any) {
        set.status = 502; return { error: `Erro ao chamar Claude: ${err.message}` }
      }

      if (!spec || !Array.isArray(spec.pages) || spec.pages.length === 0) {
        set.status = 502; return { error: "Especificação inválida gerada pelo modelo." }
      }

      // ── Pexels image filling (skip on dryRun) ────────────────
      const pexelsKey = process.env.PEXELS_API_KEY
      if (!dryRun && pexelsKey) {
        const mediaDir = join(SITES_ROOT, params.site, version, "media", "ai")
        spec = await fillSpecImages(spec, pexelsKey, mediaDir)
      }

      if (dryRun) return { success: true, dryRun: true, spec }

      // ── Apply spec ───────────────────────────────────────────
      const results: { path: string; status: "created" | "updated" | "skipped" | "error"; error?: string }[] = []

      for (const page of spec.pages) {
        const pagePath = String(page.path ?? "").replace(/^\/+|\/+$/g, "")

        try {
          const existing = await resolvePageFile(params.site, version, pagePath)
          if (existing && !page.overwrite) {
            results.push({ path: pagePath || "/", status: "skipped" }); continue
          }

          const pageTitle = page.title || pagePath.split("/").pop() || params.site
          const blocks = Array.isArray(page.blocks)
            ? page.blocks.map((b: any, i: number) => ({
                id: `${String(b.componentName).toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36)}-${i}`,
                componentName: b.componentName,
                isHero: b.isHero ?? false,
                props: b.props ?? {},
              }))
            : []

          const pageData: any = { ...(page.data ?? {}), title: pageTitle, layout: page.data?.layout ?? "default", blocks }
          await writePage(params.site, version, pagePath, pageData)

          if (page.markdown != null) {
            const dirPath = join(SITES_ROOT, params.site, version, pagePath)
            await mkdir(dirPath, { recursive: true })
            await writeFile(join(dirPath, "content.md"), page.markdown, "utf-8")
          }

          results.push({ path: pagePath || "/", status: existing ? "updated" : "created" })
        } catch (err: any) {
          results.push({ path: pagePath || "/", status: "error", error: err.message })
        }
      }

      const failed = results.filter(r => r.status === "error").length
      return { success: failed === 0, spec, results }
    },
    {
      body: t.Object({
        prompt:  t.String(),
        dryRun:  t.Optional(t.Boolean()),
        model:   t.Optional(t.String()),
      }),
    }
  )
