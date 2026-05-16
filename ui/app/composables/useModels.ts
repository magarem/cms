export type ModelTarget = "page" | "collection-item" | "any"

export interface PageModel {
  name: string
  label: string
  description?: string
  target: ModelTarget
  source?: "global" | "site"
  fields?: any[]
  blocks?: any[]
  template: {
    layout?: string
    blocks?: any[]
    [k: string]: any
  }
}

export function useModels(site: MaybeRefOrGetter<string>) {
  const api = useApi()
  const siteRef = computed(() => toValue(site))
  const models = ref<PageModel[]>([])
  const pending = ref(false)

  async function fetchModels() {
    const s = siteRef.value
    if (!s) { models.value = []; return }
    pending.value = true
    try {
      const res = await api.get<{ success: boolean; models: PageModel[] }>(`/sites/${s}/models`)
      models.value = res.models || []
    } catch {
      models.value = []
    } finally {
      pending.value = false
    }
  }

  function forTarget(target: "page" | "collection-item"): ComputedRef<PageModel[]> {
    return computed(() =>
      models.value.filter((m) => m.target === target || m.target === "any" || m.target === ("collection" as any))
    )
  }

  async function saveModel(m: Partial<PageModel> & { name: string }) {
    const s = siteRef.value
    const res = await api.post<{ success: boolean; model: PageModel }>(`/sites/${s}/models`, m)
    await fetchModels()
    return res.model
  }

  async function deleteModel(name: string) {
    const s = siteRef.value
    await api.del(`/sites/${s}/models/${encodeURIComponent(name)}`)
    await fetchModels()
  }

  return { models, pending, fetchModels, forTarget, saveModel, deleteModel }
}
