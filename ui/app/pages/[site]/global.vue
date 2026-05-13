<script setup lang="ts">
import type { PropSchema } from '~/composables/useComponentSchema'

definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()
const site = route.params.site as string

const { data, pending, refresh } = await useAsyncData(`global-${site}`, () =>
  api.get<{ success: boolean; global: Record<string, { data: any; ext: string }> }>(`/sites/${site}/global`)
)

const activeKey = ref<string | null>(null)
const editData = ref<any>(null)
const saving = ref(false)
const styleOpen = ref(true)

const STYLE_DEFAULTS = {
  bgColor: '',
  textColor: '',
  minHeight: '',
  blockPadding: '',
}

const STYLE_SCHEMA: Record<string, PropSchema> = {
  bgColor:      { name: 'bgColor',      label: 'Cor de fundo',         type: 'color' },
  textColor:    { name: 'textColor',    label: 'Cor do texto',          type: 'color' },
  minHeight:    { name: 'minHeight',    label: 'Altura mínima (ex: 200px)', type: 'text' },
  blockPadding: { name: 'blockPadding', label: 'Padding dos blocos (ex: 24px)', type: 'text' },
}

const globalKeys = computed(() => Object.keys(data.value?.global || {}))

watch(activeKey, (key) => {
  if (key && data.value?.global[key]) {
    const raw = JSON.parse(JSON.stringify(data.value.global[key].data))
    // Ensure style object exists for block-based keys
    if (Array.isArray(raw.blocks) && !raw.style) {
      raw.style = { ...STYLE_DEFAULTS }
    }
    editData.value = raw
  }
})

watchEffect(() => {
  if (globalKeys.value.length && !activeKey.value) {
    activeKey.value = globalKeys.value[0]
  }
})

async function save() {
  if (!activeKey.value) return
  saving.value = true
  try {
    await api.put(`/sites/${site}/global/${activeKey.value}`, editData.value)
    toast.add({ title: "Guardado com sucesso.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Global</span>
      <span v-if="activeKey" class="text-gray-500 text-xs font-mono ml-1">{{ activeKey }}</span>
    </template>
    <template #actions>
      <NuxtLink :to="`/${site}/preview?path=/`">
        <UButton icon="i-heroicons-eye" size="sm" color="neutral" variant="ghost">
          Preview
        </UButton>
      </NuxtLink>
      <UButton v-if="activeKey" icon="i-heroicons-check" size="sm" :loading="saving" @click="save">
        Salvar
      </UButton>
    </template>
  </CmsTopbar>

  <!-- Body -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Key list -->
    <aside class="w-48 flex-shrink-0 border-r border-gray-800 bg-gray-900 p-3 space-y-1">
      <button
        v-for="key in globalKeys"
        :key="key"
        class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
        :class="activeKey === key ? 'bg-primary-500/20 text-primary-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        @click="activeKey = key"
      >
        {{ key }}
      </button>
      <div v-if="!globalKeys.length && !pending" class="text-xs text-gray-600 px-3 py-2">
        Nenhum ficheiro global
      </div>
      <div v-if="pending" class="flex justify-center py-4">
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-600" />
      </div>
    </aside>

    <!-- Editor -->
    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="activeKey && editData">

        <!-- Block-based global keys: style panel + block editor -->
        <template v-if="Array.isArray(editData.blocks)">

          <!-- Style panel -->
          <div class="mb-6 border border-gray-800 rounded-xl overflow-hidden">
            <button
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
              @click="styleOpen = !styleOpen"
            >
              <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
                <UIcon name="i-heroicons-paint-brush" class="w-4 h-4 text-gray-500" />
                Estilo do rodapé
              </div>
              <UIcon
                :name="styleOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="w-4 h-4 text-gray-600"
              />
            </button>
            <div v-if="styleOpen" class="p-4 bg-gray-950 grid grid-cols-2 gap-4">
              <div v-for="(schema, key) in STYLE_SCHEMA" :key="key">
                <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                  {{ schema.label }}
                </label>
                <PropField
                  :field-key="key"
                  :model-value="editData.style?.[key] ?? ''"
                  :schema="schema"
                  @update:model-value="editData.style = { ...editData.style, [key]: $event }"
                />
              </div>
            </div>
          </div>

          <!-- Block editor -->
          <BlockEditor
            v-model="editData.blocks"
            :site="site"
            :content-path="`_global/${activeKey}`"
          />
        </template>

        <PropForm v-else v-model="editData" />
      </div>
      <div v-else class="flex items-center justify-center py-20 text-gray-600 text-sm">
        Selecione um ficheiro à esquerda
      </div>
    </div>
  </div>
</template>
