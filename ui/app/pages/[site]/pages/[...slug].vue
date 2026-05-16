<script setup lang="ts">
import { getPageTypeSchema } from '~/composables/useComponentSchema'

definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()

const site = route.params.site as string
const slugParts = route.params.slug as string[]
const contentPath = slugParts.join("/")

// Provide site + path for PropField (MediaPicker) inside the metadata sidebar
provide("editorSite", ref(site))
provide("editorContentPath", ref(contentPath))

const { data: pageData, pending, refresh } = await useAsyncData(
  `page-${site}-${contentPath}`,
  () => api.get<{ success: boolean; data: any; ext: string; version: string }>(
    `/sites/${site}/page?path=${encodeURIComponent(contentPath)}`
  )
)

const form = ref<any>(null)
const dirty = ref(false)
const saving = ref(false)

const modelFields = ref<any[]>([])

// Merge model template fields that are missing from the page data and capture field schema.
// Only adds keys — never overwrites existing values.
async function applyModelFields(data: Record<string, any>) {
  const modelName = data.model
  if (!modelName) {
    modelFields.value = []
    return
  }
  try {
    const res = await api.get<{ success: boolean; model: any }>(
      `/sites/${site}/models/${encodeURIComponent(modelName)}`
    )
    const tpl = res.model?.template || {}
    for (const [k, v] of Object.entries(tpl)) {
      if (k === 'blocks' || k === 'title') continue
      if (data[k] === undefined) data[k] = v
    }
    modelFields.value = Array.isArray(res.model?.fields) ? res.model.fields : []
  } catch {
    modelFields.value = []
  }
}

watch(pageData, async (val) => {
  if (!val?.data) return
  const data = JSON.parse(JSON.stringify(val.data))
  await applyModelFields(data)
  form.value = data
  dirty.value = false
}, { immediate: true })

watch(form, () => { dirty.value = true }, { deep: true })

async function save() {
  if (!form.value || saving.value) return
  saving.value = true
  try {
    await api.put(`/sites/${site}/page?path=${encodeURIComponent(contentPath)}`, form.value)
    toast.add({ title: "Página guardada.", color: "success", ui: { progress: 'hidden' } })
    dirty.value = false
  } catch {
    toast.add({ title: "Erro ao Salvar.", color: "error", ui: { progress: 'hidden' } })
  } finally {
    saving.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
}

onMounted(()   => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// Tree — shared cache key with the sidebar; tells us which segments are collections
const { data: treeData } = await useAsyncData(
  `tree-${site}`,
  () => api.get<{ tree: any[] }>(`/sites/${site}/tree`)
)

function findInTree(nodes: any[], slug: string): any | null {
  for (const node of nodes) {
    if (node.slug === slug) return node
    if (node.children?.length) {
      const hit = findInTree(node.children, slug)
      if (hit) return hit
    }
  }
  return null
}

// Breadcrumbs:
//   • parent segments  → link to /collections/… if collection, /pages/… otherwise
//   • current segment that IS a collection → link to /collections/… + title as final span
//   • current segment that is a regular page → title (or slug) as final span only
const breadcrumbs = computed(() => {
  const parts = contentPath.split('/').filter(Boolean)
  const tree = treeData.value?.tree || []
  const pageTitle = form.value?.title
  const crumbs: { label: string; to: string; isLast: boolean }[] = []

  // Parent segments
  for (let i = 0; i < parts.length - 1; i++) {
    const segPath = parts.slice(0, i + 1).join('/')
    const node = findInTree(tree, segPath)
    crumbs.push({
      label: node?.title || parts[i],
      to: node?.type === 'collection'
        ? `/${site}/collections/${segPath}`
        : `/${site}/pages/${segPath}`,
      isLast: false,
    })
  }

  // Current (last) segment
  const lastPath = parts.join('/')
  const lastNode = findInTree(tree, lastPath)

  if (lastNode?.type === 'collection') {
    // Editing the _index.yml of a collection: show collection link + title
    crumbs.push({
      label: lastNode.title || parts[parts.length - 1],
      to: `/${site}/collections/${lastPath}`,
      isLast: false,
    })
    crumbs.push({ label: pageTitle || parts[parts.length - 1], to: '', isLast: true })
  } else {
    // Regular sub-page: just the title (fallback to raw slug while loading)
    crumbs.push({
      label: pageTitle || parts[parts.length - 1] || '',
      to: '',
      isLast: true,
    })
  }

  return crumbs
})

// Schema-driven metadata fields — model fields take priority over components.json
const metaFields = computed(() =>
  modelFields.value.length > 0
    ? modelFields.value
    : getPageTypeSchema(form.value?.layout)
)

const title = computed(() => form.value?.title || contentPath.split("/").pop() || "Página")
useHead({ title: `${title.value} — Sirius CMS` })

const metaOpen = ref(true)

// Raw JSON editor
const rawOpen = ref(false)
const rawText = ref('')
const rawError = ref('')

function openRaw() {
  rawText.value = JSON.stringify(form.value, null, 2)
  rawError.value = ''
  rawOpen.value = true
}

function applyRaw() {
  try {
    form.value = JSON.parse(rawText.value)
    rawOpen.value = false
    rawError.value = ''
  } catch (e: any) {
    rawError.value = e.message
  }
}

// ── Model selector (sidebar) ──────────────────────────────────
const { saveModel, forTarget, fetchModels } = useModels(() => site)
onMounted(fetchModels)

const pageModels = forTarget("page")
const MODEL_NONE = "__none__"
const modelSelectorOptions = computed(() => [
  { value: MODEL_NONE, label: "— Sem modelo —" },
  ...pageModels.value.map((m) => ({ value: m.name, label: m.label })),
])
const linkedModel = computed({
  get: () => form.value?.model || MODEL_NONE,
  set: (v: string) => {
    if (!form.value) return
    form.value.model = v === MODEL_NONE ? undefined : v
  },
})

// When the user picks a model, merge its template fields and load the field schema
watch(linkedModel, async (newName) => {
  if (!form.value) return
  if (!newName || newName === MODEL_NONE) {
    modelFields.value = []
    return
  }
  await applyModelFields({ ...form.value, model: newName })
})

const modelOpen = ref(false)
const modelName = ref("")
const modelLabel = ref("")
const modelDescription = ref("")
const modelTarget = ref<"page" | "collection-item" | "any">("any")
const modelSaving = ref(false)

watch(modelLabel, (val) => {
  if (modelName.value) return
  modelName.value = val
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
})

function openSaveAsModel() {
  modelName.value = ""
  modelLabel.value = form.value?.title ? `Modelo — ${form.value.title}` : ""
  modelDescription.value = ""
  modelTarget.value = "any"
  modelOpen.value = true
}

// Strip per-page fields from the template so the model is reusable.
function buildTemplate(): any {
  const src = form.value || {}
  const blocks = Array.isArray(src.blocks) ? src.blocks.map((b: any) => {
    const { id, ...rest } = b || {}
    return rest
  }) : []
  const { title, date, blocks: _b, ...rest } = src
  return { ...rest, blocks }
}

async function submitSaveAsModel() {
  if (!modelName.value.trim()) return
  modelSaving.value = true
  try {
    await saveModel({
      name: modelName.value.trim(),
      label: modelLabel.value.trim() || modelName.value.trim(),
      description: modelDescription.value.trim(),
      target: modelTarget.value,
      template: buildTemplate(),
    })
    toast.add({ title: "Modelo guardado.", color: "success", ui: { progress: 'hidden' } })
    modelOpen.value = false
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao guardar modelo.", color: "error", ui: { progress: 'hidden' } })
  } finally {
    modelSaving.value = false
  }
}

const targetOptions = [
  { value: "any", label: "Qualquer" },
  { value: "page", label: "Página" },
  { value: "collection-item", label: "Item de coleção" },
]
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <template v-for="(crumb, ci) in breadcrumbs" :key="ci">
        <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
        <NuxtLink
          v-if="!crumb.isLast"
          :to="crumb.to"
          class="text-gray-400 hover:text-white transition-colors truncate max-w-[120px]"
        >{{ crumb.label }}</NuxtLink>
        <span v-else class="text-white font-medium truncate max-w-[160px]">{{ crumb.label }}</span>
      </template>
      <UBadge v-if="dirty" color="warning" variant="soft" size="xs" class="flex-shrink-0 ml-1">não guardado</UBadge>
    </template>
    <template #actions>
      <UButton icon="i-heroicons-check" size="sm" :loading="saving" :disabled="!dirty" @click="save">
        Salvar
      </UButton>
      <UButton icon="i-heroicons-code-bracket" size="sm" variant="outline" color="neutral" :disabled="!form" @click="openRaw">
        Raw
      </UButton>
      <UButton icon="i-heroicons-rectangle-group" size="sm" variant="outline" color="neutral" :disabled="!form" @click="openSaveAsModel">
        Guardar como modelo
      </UButton>
      <NuxtLink :to="`/${site}/preview?path=${encodeURIComponent(contentPath === 'home' ? '/' : '/' + contentPath)}`">
        <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral">Preview</UButton>
      </NuxtLink>
    </template>
  </CmsTopbar>

  <!-- Body -->
  <div v-if="pending" class="flex-1 flex items-center justify-center">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
  </div>

  <div v-else-if="form" class="flex-1 flex overflow-hidden">
    <!-- Page meta sidebar — schema-driven -->
    <aside
      :class="metaOpen ? 'w-64' : 'w-10'"
      class="flex-shrink-0 border-r border-gray-800 bg-gray-900 overflow-hidden transition-[width] duration-200"
    >
      <!-- Header row: title + toggle -->
      <div class="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <p v-if="metaOpen" class="text-[10px] uppercase tracking-widest text-gray-500">Metadados</p>
        <button
          class="text-gray-500 hover:text-white transition-colors ml-auto"
          :title="metaOpen ? 'Fechar metadados' : 'Abrir metadados'"
          @click="metaOpen = !metaOpen"
        >
          <UIcon
            :name="metaOpen ? 'i-heroicons-chevron-left' : 'i-heroicons-chevron-right'"
            class="w-4 h-4"
          />
        </button>
      </div>

      <!-- Content — only rendered when open -->
      <div v-if="metaOpen" class="overflow-y-auto h-[calc(100%-41px)] pb-5">
        <div class="p-4 space-y-4">
          <div class="space-y-3">
            <UFormField
              v-for="field in metaFields.filter(f => f.name !== 'model')"
              :key="field.name"
              :label="field.label"
              :required="field.required"
            >
              <PropField
                :field-key="field.name"
                :model-value="form[field.name] ?? field.default ?? ''"
                :schema="field"
                @update:model-value="form[field.name] = $event"
              />
            </UFormField>
          </div>
          <div class="border-t border-gray-800 pt-3">
            <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Modelo</p>
            <USelect
              v-model="linkedModel"
              :items="modelSelectorOptions"
              value-key="value"
              size="xs"
              class="w-full"
            />
          </div>
          <!-- <div class="border-t border-gray-800 pt-3">
            <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">!Ficheiro</p>
            <p class="text-xs text-gray-600 font-mono break-all">{{ contentPath }}</p>
            <p class="text-[10px] text-gray-700 mt-1">{{ pageData?.ext }} · {{ pageData?.version }}</p>
          </div> -->
        </div>
      </div>
    </aside>

    <!-- Block editor -->
    <div class="flex-1 flex flex-col min-h-0">
      <BlockEditor v-model="form.blocks" :site="site" :content-path="contentPath" @reorder="save()" />
    </div>
  </div>

  <div v-else class="flex-1 flex items-center justify-center text-gray-600 text-sm">
    Página não encontrada
  </div>

  <!-- Save as model modal -->
  <UModal v-model:open="modelOpen" title="Guardar como modelo">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          A estrutura atual (blocos + metadados) desta página será guardada como um modelo reutilizável.
          O título e a data são removidos — cada novo conteúdo terá os seus próprios.
        </p>
        <UFormField label="Rótulo" required>
          <UInput
            v-model="modelLabel"
            placeholder="ex: Artigo de Blog"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UFormField label="Nome (slug)" required hint="Identificador único, sem espaços">
          <UInput
            v-model="modelName"
            placeholder="ex: artigo-blog"
            class="w-full font-mono"
          />
        </UFormField>
        <UFormField label="Descrição">
          <UInput
            v-model="modelDescription"
            placeholder="Para que serve este modelo?"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Tipo" required>
          <USelect
            v-model="modelTarget"
            :items="targetOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="modelOpen = false">Cancelar</UButton>
        <UButton
          icon="i-heroicons-check"
          :loading="modelSaving"
          :disabled="!modelName.trim()"
          @click="submitSaveAsModel"
        >
          Guardar
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Raw JSON editor modal -->
  <UModal v-model:open="rawOpen" title="Editar ficheiro raw" :ui="{ content: 'max-w-4xl' }">
    <template #body>
      <div class="space-y-2">
        <textarea
          v-model="rawText"
          class="w-full h-[60vh] font-mono text-xs bg-gray-950 text-gray-200 border border-gray-700 rounded-lg p-3 resize-none focus:outline-none focus:border-primary-500"
          spellcheck="false"
        />
        <p v-if="rawError" class="text-xs text-red-400 font-mono">{{ rawError }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="rawOpen = false">Cancelar</UButton>
        <UButton icon="i-heroicons-check" @click="applyRaw">Aplicar</UButton>
      </div>
    </template>
  </UModal>

</template>
