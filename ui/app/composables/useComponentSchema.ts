import rawData from '~/data/components.json'

export interface PropSchema {
  name: string
  label: string
  type: string
  required?: boolean
  default?: any
  description?: string
  options?: { value: any; label: string }[]
  fields?: PropSchema[]      // for type: 'object'
  itemSchema?: PropSchema[]  // for type: 'array'
  group?: string             // for cross-list drag (media-array)
}

export interface ComponentSchema {
  name: string
  file: string
  category: 'block' | 'layout' | 'ui'
  description?: string
  cms_hidden?: boolean
  props?: PropSchema[]
}

export interface PageTypeSchema {
  name: string
  label: string
  fields: PropSchema[]
}

const components = rawData.components as ComponentSchema[]
const pageTypes = (rawData as any).page_types as PageTypeSchema[]

/** Return the frontmatter field schema for a given layout name.
 *  Falls back to "default" if the layout is not found. */
export function getPageTypeSchema(layout?: string): PropSchema[] {
  const match = pageTypes?.find(p => p.name === (layout || 'default'))
  return match?.fields ?? pageTypes?.find(p => p.name === 'default')?.fields ?? []
}

/** All components usable as page blocks (category=block, not hidden) */
export const blockComponents = components.filter(
  (c) => c.category === 'block' && !c.cms_hidden
)

/** All non-hidden components grouped by category for the block picker */
export const componentGroups: { label: string; key: string; components: ComponentSchema[] }[] = [
  { label: 'Blocos',  key: 'block',  components: components.filter(c => c.category === 'block'  && !c.cms_hidden) },
  { label: 'Layout',  key: 'layout', components: components.filter(c => c.category === 'layout' && !c.cms_hidden) },
  { label: 'UI',      key: 'ui',     components: components.filter(c => c.category === 'ui'     && !c.cms_hidden) },
].filter(g => g.components.length > 0)

/** Find a component definition by name */
export function getSchema(name: string): ComponentSchema | undefined {
  return components.find((c) => c.name === name)
}

/** Build a default props object from a component's schema */
export function buildDefaultProps(name: string): Record<string, any> {
  const schema = getSchema(name)
  if (!schema?.props) return {}
  return propsToDefaults(schema.props)
}

function propDefault(prop: PropSchema): any {
  if (prop.default !== undefined && prop.default !== null) {
    if (prop.type === 'object' && prop.fields) {
      // Merge explicit default with sub-field defaults
      return { ...propsToDefaults(prop.fields), ...(prop.default as object) }
    }
    return prop.default
  }

  switch (prop.type) {
    case 'text':
    case 'textarea':
    case 'markdown':
    case 'mdfile':
    case 'url':
    case 'email':
    case 'path':
    case 'icon':
    case 'color':
    case 'date':
    case 'image':
    case 'video':
    case 'media':
      return ''
    case 'image-array':
      return []
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      return prop.options?.[0]?.value ?? ''
    case 'array':
      return []
    case 'object':
      return prop.fields ? propsToDefaults(prop.fields) : {}
    default:
      return ''
  }
}

function propsToDefaults(props: PropSchema[]): Record<string, any> {
  const result: Record<string, any> = {}
  for (const prop of props) {
    result[prop.name] = propDefault(prop)
  }
  return result
}
