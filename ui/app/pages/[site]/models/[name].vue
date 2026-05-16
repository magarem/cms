<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus"
import type { ModelTarget } from "~/composables/useModels"

definePageMeta({ layout: "cms" })

const route  = useRoute()
const api    = useApi()
const toast  = useToast()

const site      = route.params.site as string
const modelName = route.params.name as string

// ── Load model ────────────────────────────────────────────────
const { data: modelData, pending, refresh } = await useAsyncData(
  `model-${site}-${modelName}`,
  () => api.get<{ success: boolean; model: any }>(`/sites/${site}/models/${encodeURIComponent(modelName)}`)
)

const isGlobal  = computed(() => modelData.value?.model?.source === "global")
const readOnly  = computed(() => isGlobal.value)

// Editable copies
const metaLabel       = ref("")
const metaDescription = ref("")
const metaTarget      = ref<ModelTarget>("any")
const fields          = ref<any[]>([])
const blocks          = ref<any[]>([])
const dirty           = ref(false)
const saving          = ref(false)

watch(modelData, (val) => {
  if (!val?.model) return
  const m = val.model
  metaLabel.value       = m.label || m.name || modelName
  metaDescription.value = m.description || ""
  metaTarget.value      = m.target || "any"
  fields.value          = JSON.parse(JSON.stringify(m.fields || []))
  blocks.value          = JSON.parse(JSON.stringify(m.blocks || []))
  dirty.value = false
}, { immediate: true })

watch([metaLabel, metaDescription, metaTarget, fields, blocks], () => { dirty.value = true }, { deep: true })

// ── Save ──────────────────────────────────────────────────────
async function save() {
  if (readOnly.value || saving.value) return
  saving.value = true
  try {
    await api.post(`/sites/${site}/models`, {
      name:        modelName,
      label:       metaLabel.value.trim() || modelName,
      description: metaDescription.value.trim(),
      target:      metaTarget.value,
      fields:      fields.value,
      blocks:      blocks.value,
    })
    toast.add({ title: "Modelo guardado.", color: "success", ui: { progress: "hidden" } })
    dirty.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao guardar.", color: "error", ui: { progress: "hidden" } })
  } finally {
    saving.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save() }
}
onMounted(()   => window.addEventListener("keydown", onKeyDown))
onUnmounted(() => window.removeEventListener("keydown", onKeyDown))

// ── Field helpers ─────────────────────────────────────────────

const FIELD_TYPES = [
  { value: "string",       label: "Texto curto" },
  { value: "markdown",     label: "Markdown / Rich Text" },
  { value: "date",         label: "Data" },
  { value: "image",        label: "Imagem" },
  { value: "image-array",  label: "Galeria de imagens" },
  { value: "select",       label: "Seleção (select)" },
  { value: "boolean",      label: "Sim/Não (toggle)" },
  { value: "url",          label: "URL" },
  { value: "color",        label: "Cor" },
  { value: "string-array", label: "Lista de textos" },
  { value: "object",       label: "Objeto aninhado" },
]

const TARGET_OPTIONS = [
  { value: "any",               label: "Qualquer" },
  { value: "page",              label: "Página" },
  { value: "collection-item",   label: "Item de coleção" },
]

const expandedField = ref<number | null>(null)

function toggleField(idx: number) {
  expandedField.value = expandedField.value === idx ? null : idx
}

function slugify(val: string) {
  return val
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function addField() {
  const idx = fields.value.length
  fields.value.push({ name: `field_${idx + 1}`, label: `Campo ${idx + 1}`, type: "string", default: "" })
  expandedField.value = idx
  dirty.value = true
}

function removeField(idx: number) {
  fields.value.splice(idx, 1)
  if (expandedField.value === idx) expandedField.value = null
  dirty.value = true
}

function moveField(from: number, to: number) {
  const arr = fields.value
  if (to < 0 || to >= arr.length) return
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  dirty.value = true
}

function onFieldLabelInput(idx: number, val: string) {
  const f = fields.value[idx]
  const wasAuto = f.name === slugify(f.label || "")
  f.label = val
  if (wasAuto || !f.name) f.name = slugify(val)
  dirty.value = true
}

// Select options helpers
function addOption(field: any) {
  if (!Array.isArray(field.options)) field.options = []
  field.options.push({ value: "", label: "" })
  dirty.value = true
}

function removeOption(field: any, idx: number) {
  field.options.splice(idx, 1)
  dirty.value = true
}

// Default value placeholder by type
function defaultPlaceholder(type: string): string {
  const map: Record<string, string> = {
    string: "ex: Texto padrão",
    markdown: "ex: # Título",
    date: "ex: $today ou 2024-01-01",
    image: "",
    "image-array": "[]",
    select: "ex: valor-padrao",
    boolean: "true ou false",
    url: "ex: https://...",
    color: "ex: #ffffff",
    "string-array": "[]",
    object: "{}",
  }
  return map[type] || ""
}

// ── Blocks (BlockEditor bridge) ───────────────────────────────
const formBlocks = computed({
  get: () => blocks.value,
  set: (v) => { blocks.value = v; dirty.value = true },
})

useHead({ title: computed(() => `${metaLabel.value || modelName} — Modelo | Sirius CMS`) })
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700" />
      <NuxtLink :to="`/${site}/models`" class="text-gray-400 hover:text-white transition-colors">Modelos</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700" />
      <span class="text-white font-medium truncate max-w-[200px]">{{ metaLabel || modelName }}</span>
      <UBadge v-if="isGlobal" color="neutral" variant="soft" size="xs" class="ml-1">Global</UBadge>
      <UBadge v-if="dirty && !readOnly" color="warning" variant="soft" size="xs" class="ml-1">não guardado</UBadge>
    </template>
    <template #actions>
      <UButton
        v-if="!readOnly"
        icon="i-heroicons-check"
        size="sm"
        :loading="saving"
        :disabled="!dirty"
        @click="save"
      >
        Guardar
      </UButton>
      <UBadge v-else color="neutral" variant="soft" size="sm">Só leitura (Global)</UBadge>
    </template>
  </CmsTopbar>

  <!-- Loading -->
  <div v-if="pending" class="flex-1 flex items-center justify-center">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
  </div>

  <div v-else class="flex-1 flex overflow-hidden">

    <!-- ── Sidebar ─────────────────────────────────────────────── -->
    <aside class="w-72 flex-shrink-0 border-r border-gray-800 bg-gray-900 overflow-y-auto flex flex-col">

      <!-- Metadata -->
      <div class="p-4 space-y-3 border-b border-gray-800">
        <p class="text-[10px] uppercase tracking-widest text-gray-500">Metadados</p>

        <UFormField label="Rótulo">
          <UInput
            v-model="metaLabel"
            :disabled="readOnly"
            placeholder="Nome visível"
            class="w-full"
            size="sm"
          />
        </UFormField>

        <UFormField label="Descrição">
          <UInput
            v-model="metaDescription"
            :disabled="readOnly"
            placeholder="Para que serve?"
            class="w-full"
            size="sm"
          />
        </UFormField>

        <UFormField label="Tipo de página">
          <USelect
            v-model="metaTarget"
            :disabled="readOnly"
            :items="TARGET_OPTIONS"
            value-key="value"
            size="sm"
            class="w-full"
          />
        </UFormField>

        <div class="text-[10px] text-gray-600 font-mono break-all">
          {{ modelData?.model?.source === 'global' ? 'cms/models/' : `storage/${site}/_models/` }}{{ modelName }}.yml
        </div>
      </div>

      <!-- Fields -->
      <div class="flex-1 overflow-y-auto">
        <div class="flex items-center justify-between px-4 pt-4 pb-2">
          <p class="text-[10px] uppercase tracking-widest text-gray-500">Campos</p>
          <button
            v-if="!readOnly"
            class="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors"
            @click="addField"
          >
            <UIcon name="i-heroicons-plus-circle" class="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>

        <div v-if="!fields.length" class="px-4 pb-4 text-xs text-gray-700 italic">
          Sem campos definidos.
        </div>

        <VueDraggable
          v-model="fields"
          :disabled="readOnly"
          handle=".drag-handle"
          animation="150"
          class="flex flex-col"
          @end="dirty = true"
        >
          <div
            v-for="(field, idx) in fields"
            :key="field.name + idx"
            class="border-b border-gray-800/60 last:border-0"
          >
            <!-- Field row header -->
            <div
              class="flex items-center gap-1 px-3 py-2 cursor-pointer hover:bg-gray-800/40 transition-colors"
              @click="toggleField(idx)"
            >
              <UIcon
                v-if="!readOnly"
                name="i-heroicons-bars-2"
                class="drag-handle w-3.5 h-3.5 text-gray-700 hover:text-gray-400 cursor-grab flex-shrink-0"
                @click.stop
              />
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-300 truncate font-medium">{{ field.label || field.name }}</p>
                <p class="text-[10px] font-mono text-gray-600 truncate">{{ field.name }} · {{ field.type }}</p>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <UBadge v-if="field.required" color="error" variant="soft" size="xs">req</UBadge>
                <button
                  v-if="!readOnly"
                  class="text-gray-700 hover:text-red-400 transition-colors p-0.5"
                  @click.stop="removeField(idx)"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                </button>
                <UIcon
                  :name="expandedField === idx ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-3 h-3 text-gray-600"
                />
              </div>
            </div>

            <!-- Field editor (expanded) -->
            <div v-if="expandedField === idx" class="px-3 pb-3 space-y-2.5 bg-gray-800/20">

              <UFormField label="Rótulo" size="xs">
                <UInput
                  :model-value="field.label"
                  :disabled="readOnly"
                  size="xs"
                  class="w-full"
                  @input="onFieldLabelInput(idx, ($event.target as HTMLInputElement).value)"
                />
              </UFormField>

              <UFormField label="Nome (chave)" size="xs">
                <UInput
                  v-model="field.name"
                  :disabled="readOnly"
                  size="xs"
                  class="w-full font-mono"
                  @input="dirty = true"
                />
              </UFormField>

              <UFormField label="Tipo" size="xs">
                <USelect
                  v-model="field.type"
                  :disabled="readOnly"
                  :items="FIELD_TYPES"
                  value-key="value"
                  size="xs"
                  class="w-full"
                  @change="dirty = true"
                />
              </UFormField>

              <UFormField label="Padrão" size="xs">
                <UInput
                  v-model="field.default"
                  :disabled="readOnly"
                  :placeholder="defaultPlaceholder(field.type)"
                  size="xs"
                  class="w-full"
                  @input="dirty = true"
                />
              </UFormField>

              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :id="`req-${idx}`"
                  v-model="field.required"
                  :disabled="readOnly"
                  class="accent-primary"
                  @change="dirty = true"
                />
                <label :for="`req-${idx}`" class="text-xs text-gray-400 cursor-pointer">Obrigatório</label>
              </div>

              <!-- Select options -->
              <div v-if="field.type === 'select'" class="space-y-1.5">
                <p class="text-[10px] uppercase tracking-widest text-gray-600">Opções</p>
                <div
                  v-for="(opt, oi) in (field.options || [])"
                  :key="oi"
                  class="flex items-center gap-1.5"
                >
                  <UInput
                    v-model="opt.value"
                    :disabled="readOnly"
                    placeholder="valor"
                    size="xs"
                    class="w-1/2 font-mono"
                    @input="dirty = true"
                  />
                  <UInput
                    v-model="opt.label"
                    :disabled="readOnly"
                    placeholder="rótulo"
                    size="xs"
                    class="w-1/2"
                    @input="dirty = true"
                  />
                  <button
                    v-if="!readOnly"
                    class="text-gray-700 hover:text-red-400 transition-colors flex-shrink-0"
                    @click="removeOption(field, oi)"
                  >
                    <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  v-if="!readOnly"
                  class="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1 mt-1"
                  @click="addOption(field)"
                >
                  <UIcon name="i-heroicons-plus" class="w-3 h-3" />
                  Adicionar opção
                </button>
              </div>

              <!-- Object note -->
              <div v-if="field.type === 'object'" class="text-[10px] text-gray-600 italic leading-relaxed">
                Os campos aninhados do objeto devem ser editados no YAML:
                <span class="font-mono not-italic">fields[{{ idx }}].fields</span>
              </div>
            </div>
          </div>
        </VueDraggable>
      </div>
    </aside>

    <!-- ── Main: block editor ──────────────────────────────────── -->
    <div class="flex-1 flex flex-col min-h-0 bg-gray-950">
      <div class="px-5 py-3 border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-600">
        Blocos do modelo
      </div>
      <div class="flex-1 overflow-auto">
        <BlockEditor
          v-model="formBlocks"
          :site="site"
          :content-path="`_models/${modelName}`"
          @reorder="dirty = true"
        />
      </div>
    </div>

  </div>
</template>
