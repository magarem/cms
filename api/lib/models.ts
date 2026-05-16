import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, extname, basename } from "node:path"
import { SITES_ROOT, parseContent, serializeContent } from "./content"

export type ModelTarget = "page" | "collection-item" | "any"

// Field schema entry inside a model's `fields:` array
export interface ModelField {
  name: string
  label?: string
  type: string
  required?: boolean
  default?: any
  options?: Array<{ value: any; label: string }>
  fields?: ModelField[]  // for nested objects
  [k: string]: any
}

// What lives in a model YAML file
export interface ModelFile {
  name?: string         // human label (the example uses `name:` for label)
  label?: string        // alias for name
  description?: string
  target?: ModelTarget | "all" | "collection"
  fields?: ModelField[]
  blocks?: any[]
  [k: string]: any
}

// Resolved model used by the rest of the system
export interface PageModel {
  name: string                       // slug = filename without ext
  label: string                      // display name
  description?: string
  target: ModelTarget
  source: "global" | "site"          // where it came from
  fields?: ModelField[]
  blocks?: any[]
  template: Record<string, any>      // built from field defaults (single source of truth)
}

// ── Locations ─────────────────────────────────────────────────

export const GLOBAL_MODELS_ROOT =
  process.env.SIRIUS_GLOBAL_MODELS_ROOT ??
  join(SITES_ROOT, "..", "cms", "models")

export function siteModelsDir(site: string): string {
  return join(SITES_ROOT, site, "_models")
}

const DEFAULT_PAGE_MODEL = "normal-page"
const MODEL_EXTS = [".yml", ".yaml", ".json"]

export function sanitizeName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeTarget(t: any): ModelTarget {
  if (t === "all") return "any"
  if (t === "collection") return "collection-item"
  if (t === "page" || t === "collection-item" || t === "any") return t
  return "any"
}

// ── Field → template defaults ─────────────────────────────────

function resolveDefault(value: any): any {
  if (value === "$today") return new Date().toISOString().split("T")[0]
  if (value === "$now")   return new Date().toISOString()
  return value
}

function buildTemplateFromFields(fields: ModelField[] | undefined): Record<string, any> {
  if (!Array.isArray(fields)) return {}
  const out: Record<string, any> = {}
  for (const f of fields) {
    if (!f?.name) continue
    if (f.type === "object" && Array.isArray(f.fields)) {
      const nested = buildTemplateFromFields(f.fields)
      const override = (f.default && typeof f.default === "object") ? f.default : {}
      out[f.name] = { ...nested, ...override }
    } else if (f.default !== undefined) {
      out[f.name] = resolveDefault(f.default)
    }
  }
  return out
}

// ── File reading ──────────────────────────────────────────────

async function readModelFile(dir: string, slug: string): Promise<ModelFile | null> {
  for (const ext of MODEL_EXTS) {
    const path = join(dir, `${slug}${ext}`)
    if (existsSync(path)) {
      const raw = await readFile(path, "utf-8")
      return (await parseContent(raw, ext)) || {}
    }
  }
  return null
}

function toPageModel(file: ModelFile, slug: string, source: "global" | "site"): PageModel {
  const target = normalizeTarget(file.target)
  return {
    name: slug,
    label: file.label || file.name || slug,
    description: file.description || "",
    target,
    source,
    fields: Array.isArray(file.fields) ? file.fields : undefined,
    blocks: Array.isArray(file.blocks) ? file.blocks : undefined,
    template: {
      ...buildTemplateFromFields(file.fields),
      ...(Array.isArray(file.blocks) ? { blocks: file.blocks } : {}),
    },
  }
}

async function listDir(dir: string, source: "global" | "site"): Promise<PageModel[]> {
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const out: PageModel[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (!e.isFile()) continue
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue
    const ext = extname(e.name)
    if (!MODEL_EXTS.includes(ext)) continue
    const slug = sanitizeName(basename(e.name, ext))
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    const raw = await readFile(join(dir, e.name), "utf-8")
    const file = (await parseContent(raw, ext)) as ModelFile
    out.push(toPageModel(file || {}, slug, source))
  }
  return out
}

// ── Public API ────────────────────────────────────────────────

export async function listModels(site: string): Promise<PageModel[]> {
  const [globals, locals] = await Promise.all([
    listDir(GLOBAL_MODELS_ROOT, "global"),
    listDir(siteModelsDir(site), "site"),
  ])
  // Site models override global ones with the same slug
  const map = new Map<string, PageModel>()
  for (const m of globals) map.set(m.name, m)
  for (const m of locals)  map.set(m.name, m)
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

export async function getModel(site: string, name: string): Promise<PageModel | null> {
  const slug = sanitizeName(name)
  if (!slug) return null
  // Site dir first — overrides global
  const local = await readModelFile(siteModelsDir(site), slug)
  if (local) return toPageModel(local, slug, "site")
  const global = await readModelFile(GLOBAL_MODELS_ROOT, slug)
  if (global) return toPageModel(global, slug, "global")
  return null
}

export async function saveModel(
  site: string,
  model: Partial<PageModel> & { name: string }
): Promise<PageModel> {
  const slug = sanitizeName(model.name)
  if (!slug) throw new Error("Nome do modelo inválido.")

  const dir = siteModelsDir(site)
  await mkdir(dir, { recursive: true })

  const file: ModelFile = {
    name: model.label || model.name || slug,
    description: model.description || "",
    target: normalizeTarget(model.target),
    ...(Array.isArray(model.fields) ? { fields: model.fields } : {}),
    ...(Array.isArray(model.blocks) ? { blocks: model.blocks } : {}),
  }
  await writeFile(join(dir, `${slug}.yml`), serializeContent(file, ".yml"), "utf-8")

  return toPageModel(file, slug, "site")
}

export async function deleteModel(site: string, name: string): Promise<void> {
  const slug = sanitizeName(name)
  if (!slug) return
  for (const ext of MODEL_EXTS) {
    const path = join(siteModelsDir(site), `${slug}${ext}`)
    if (existsSync(path)) { await rm(path); break }
  }
}

// ── Apply model to create a new page ─────────────────────────

export function applyModel(
  model: PageModel,
  ctx: { title: string; slug: string }
): { data: any; needsContentMd: boolean } {
  const tpl = JSON.parse(JSON.stringify(model.template || {}))
  const blocks: any[] = Array.isArray(tpl.blocks) ? tpl.blocks : []
  let needsContentMd = false

  const fresh = blocks.map((b: any, idx: number) => {
    const componentName = b?.componentName || "Unknown"
    const next: any = {
      id: `${componentName.toLowerCase()}-${Date.now().toString(36)}-${idx}`,
      componentName,
      isHero: !!b?.isHero,
      ...(b?.label ? { label: String(b.label) } : {}),
      ...(b?.active === false ? { active: false } : {}),
      props: { ...(b?.props || {}) },
    }
    if (componentName === "ContentMD") {
      const fileName = next.props.fileName || "content.md"
      next.props.fileName = fileName
      next.props.pagePath = ctx.slug
      if (fileName === "content.md") needsContentMd = true
    }
    if (componentName === "ChildGrid" && !next.props.parentPath) {
      next.props.parentPath = ctx.slug
    }
    return next
  })

  const { blocks: _omit, ...rest } = tpl
  const data = { ...rest, title: ctx.title, blocks: fresh }
  if (!data.layout) data.layout = "default"
  return { data, needsContentMd }
}

// Resolve the model used when the user did not pick one explicitly.
// Falls back to a hard-coded template if "normal-page" doesn't exist.
export async function resolveDefaultModel(site: string): Promise<PageModel | null> {
  return await getModel(site, DEFAULT_PAGE_MODEL)
}

export function defaultPageTemplate(slug: string): { data: any; needsContentMd: boolean } {
  return {
    data: {
      layout: "default",
      blocks: [{
        id: `contentmd-${Date.now().toString(36)}`,
        componentName: "ContentMD",
        isHero: false,
        props: { pagePath: slug, fileName: "content.md" },
      }],
    },
    needsContentMd: true,
  }
}

export function defaultCollectionItemTemplate(): { data: any; needsContentMd: boolean } {
  return {
    data: {
      layout: "post",
      date: new Date().toISOString().split("T")[0],
      blocks: [{
        id: `contentmd-${Date.now().toString(36)}`,
        componentName: "ContentMD",
        isHero: false,
        props: {},
      }],
    },
    needsContentMd: false,
  }
}
