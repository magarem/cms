<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()

const site = route.params.site as string
const slug = route.params.slug as string
const contentPath = `terapeutas/${slug}`

provide("editorSite", ref(site))
provide("editorContentPath", ref(contentPath))

// ── Load page data ────────────────────────────────────────────────────────────
const { data: pageData, pending, refresh } = await useAsyncData(
  `page-${site}-${contentPath}`,
  () => api.get<{ success: boolean; data: any; ext: string; version: string }>(
    `/sites/${site}/page?path=${encodeURIComponent(contentPath)}`
  )
)

const form = ref<any>(null)
const dirty = ref(false)
const saving = ref(false)

// Load linked model's field schema
const modelFields = ref<any[]>([])

async function loadModel(modelName: string) {
  if (!modelName) { modelFields.value = []; return }
  try {
    const res = await api.get<{ success: boolean; model: any }>(
      `/sites/${site}/models/${encodeURIComponent(modelName)}`
    )
    // Merge template defaults into form for any missing key
    const tpl = res.model?.template || {}
    if (form.value) {
      for (const [k, v] of Object.entries(tpl)) {
        if (k === 'blocks' || k === 'title') continue
        if (form.value[k] === undefined) form.value[k] = v
      }
    }
    modelFields.value = Array.isArray(res.model?.fields) ? res.model.fields : []
  } catch {
    modelFields.value = []
  }
}

watch(pageData, async (val) => {
  if (!val?.data) return
  form.value = JSON.parse(JSON.stringify(val.data))
  dirty.value = false
  await loadModel(form.value?.model || '')
}, { immediate: true })

watch(form, () => { dirty.value = true }, { deep: true })

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  if (!form.value || saving.value) return
  saving.value = true
  try {
    await api.put(`/sites/${site}/page?path=${encodeURIComponent(contentPath)}`, form.value)
    toast.add({ title: "Terapeuta guardado.", color: "success", ui: { progress: 'hidden' } })
    dirty.value = false
  } catch {
    toast.add({ title: "Erro ao guardar.", color: "error", ui: { progress: 'hidden' } })
  } finally {
    saving.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
}
onMounted(()   => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// ── Field helpers ─────────────────────────────────────────────────────────────

// Fields from model that are NOT special-cased in the dedicated sections
const PROFILE_FIELDS = new Set(['title', 'terapia', 'escola', 'description', 'image', 'sideimages', 'sideimages_position', 'seo'])
const SYSTEM_FIELDS  = new Set(['blocks', 'model', 'layout'])

const extraModelFields = computed(() =>
  modelFields.value.filter(f =>
    !PROFILE_FIELDS.has(f.name) && !SYSTEM_FIELDS.has(f.name)
  )
)

// Model selector — show all collection-item + any models
const { models: allModels, fetchModels } = useModels(() => site)
onMounted(fetchModels)

const collectionModels = computed(() =>
  allModels.value.filter(m => m.target === 'collection-item' || m.target === 'any')
)
const MODEL_NONE = '__none__'
const modelOptions = computed(() => [
  { value: MODEL_NONE, label: '— Sem modelo —' },
  ...collectionModels.value.map(m => ({ value: m.name, label: m.label })),
])
const linkedModel = computed({
  get: () => form.value?.model || MODEL_NONE,
  set: async (v: string) => {
    if (!form.value) return
    form.value.model = v === MODEL_NONE ? undefined : v
    await loadModel(v === MODEL_NONE ? '' : v)
  },
})

// ── Sidebar panel state ───────────────────────────────────────────────────────
const seoOpen = ref(false)
const seoField = computed(() => modelFields.value.find(f => f.name === 'seo') || null)

useHead({ title: computed(() => `${form.value?.title || slug} — Sirius CMS`) })
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700" />
      <NuxtLink :to="`/${site}/collections/terapeutas`" class="text-gray-400 hover:text-white transition-colors truncate max-w-[100px]">
        Terapeutas
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700" />
      <span class="text-white font-medium truncate max-w-[160px]">{{ form?.title || slug }}</span>
      <UBadge v-if="dirty" color="warning" variant="soft" size="xs" class="ml-1">não guardado</UBadge>
    </template>
    <template #actions>
      <UButton icon="i-heroicons-check" size="sm" :loading="saving" :disabled="!dirty" @click="save">
        Guardar
      </UButton>
      <NuxtLink :to="`/${site}/preview?path=${encodeURIComponent('/' + contentPath)}`">
        <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral">Preview</UButton>
      </NuxtLink>
    </template>
  </CmsTopbar>

  <!-- Loading -->
  <div v-if="pending" class="flex-1 flex items-center justify-center">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
  </div>

  <div v-else-if="form" class="flex-1 flex overflow-hidden">

    <!-- ── Profile sidebar ─────────────────────────────────────────────────── -->
    <aside class="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-900 overflow-y-auto">

      <!-- Cover image -->
      <div class="p-4 border-b border-gray-800">
        <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Foto de perfil</p>
        <PropField
          field-key="image"
          :model-value="form.image ?? []"
          :schema="{ name: 'image', label: 'Foto', type: 'image-array', default: [] }"
          @update:model-value="form.image = $event"
        />
      </div>

      <!-- Core profile fields -->
      <div class="p-4 space-y-4 border-b border-gray-800">
        <p class="text-[10px] uppercase tracking-widest text-gray-500">Perfil</p>

        <!-- Title / Name -->
        <UFormField label="Nome" required>
          <UInput
            v-model="form.title"
            placeholder="Nome do terapeuta"
            class="w-full"
            size="sm"
          />
        </UFormField>

        <!-- Terapia — highlighted -->
        <UFormField label="Terapia">
          <div class="space-y-1.5">
            <UInput
              v-model="form.terapia"
              placeholder="ex: Yoga, Massagem, Reiki…"
              class="w-full"
              size="sm"
            />
            <div v-if="form.terapia"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
              style="background: var(--color-primary, #6366f1)">
              <UIcon name="i-heroicons-heart" class="w-3 h-3" />
              {{ form.terapia }}
            </div>
          </div>
        </UFormField>

        <!-- Escola -->
        <UFormField label="Escola / Formação">
          <UInput
            v-model="form.escola"
            placeholder="ex: Instituto de Yoga de Lisboa"
            class="w-full"
            size="sm"
          />
        </UFormField>

        <!-- Description / Bio -->
        <UFormField label="Bio">
          <UTextarea
            v-model="form.description"
            placeholder="Breve descrição do terapeuta…"
            :rows="3"
            class="w-full"
            size="sm"
          />
        </UFormField>
      </div>

      <!-- Side images -->
      <div class="p-4 border-b border-gray-800 space-y-2">
        <p class="text-[10px] uppercase tracking-widest text-gray-500">Imagens laterais</p>
        <PropField
          field-key="sideimages"
          :model-value="form.sideimages ?? []"
          :schema="{ name: 'sideimages', label: 'Imagens laterais', type: 'image-array', default: [] }"
          @update:model-value="form.sideimages = $event"
        />
        <div class="flex items-center gap-2 mt-1">
          <p class="text-[10px] text-gray-600">Posição:</p>
          <USelect
            v-model="form.sideimages_position"
            :items="[{ value: 'right', label: 'Direita' }, { value: 'left', label: 'Esquerda' }]"
            value-key="value"
            size="xs"
            class="flex-1"
          />
        </div>
      </div>

      <!-- Extra model fields (date + any others from model not in profile section) -->
      <div v-if="extraModelFields.length" class="p-4 border-b border-gray-800 space-y-3">
        <p class="text-[10px] uppercase tracking-widest text-gray-500">Detalhes</p>
        <UFormField
          v-for="field in extraModelFields"
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

      <!-- SEO (collapsible) -->
      <div v-if="seoField" class="border-b border-gray-800">
        <button
          class="w-full flex items-center justify-between px-4 py-3 text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
          @click="seoOpen = !seoOpen"
        >
          <span>SEO</span>
          <UIcon :name="seoOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3.5 h-3.5" />
        </button>
        <div v-if="seoOpen" class="px-4 pb-4 space-y-3">
          <UFormField
            v-for="sub in seoField.fields || []"
            :key="sub.name"
            :label="sub.label"
          >
            <PropField
              :field-key="sub.name"
              :model-value="(form.seo ?? {})[sub.name] ?? sub.default ?? ''"
              :schema="sub"
              @update:model-value="form.seo = { ...(form.seo || {}), [sub.name]: $event }"
            />
          </UFormField>
        </div>
      </div>

      <!-- Model link -->
      <div class="p-4 border-b border-gray-800">
        <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Modelo</p>
        <USelect
          v-model="linkedModel"
          :items="modelOptions"
          value-key="value"
          size="xs"
          class="w-full"
        />
      </div>

      <!-- File info -->
      <div class="p-4">
        <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Ficheiro</p>
        <p class="text-xs text-gray-600 font-mono break-all">{{ contentPath }}</p>
        <p class="text-[10px] text-gray-700 mt-1">{{ pageData?.ext }} · {{ pageData?.version }}</p>
      </div>
    </aside>

    <!-- ── Block editor ─────────────────────────────────────────────────────── -->
    <div class="flex-1 flex flex-col min-h-0">
      <BlockEditor v-model="form.blocks" :site="site" :content-path="contentPath" @reorder="save()" />
    </div>

  </div>

  <div v-else class="flex-1 flex items-center justify-center text-gray-600 text-sm">
    Terapeuta não encontrado
  </div>
</template>
