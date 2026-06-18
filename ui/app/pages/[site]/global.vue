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
  copyright: '',
  vendorName: '',
  vendorUrl: '',
  copyrightAlign: 'justify',
  showDarkToggle: true,
}

const STYLE_SCHEMA: Record<string, PropSchema> = {
  bgColor:      { name: 'bgColor',      label: 'Cor de fundo',                   type: 'color' },
  textColor:    { name: 'textColor',    label: 'Cor do texto',                   type: 'color' },
  minHeight:    { name: 'minHeight',    label: 'Altura mínima (ex: 200px)',       type: 'text' },
  blockPadding: { name: 'blockPadding', label: 'Padding dos blocos (ex: 24px)',  type: 'text' },
}

const FOOTER_STYLE_SCHEMA: Record<string, PropSchema> = {
  copyright:    { name: 'copyright',    label: 'Linha de copyright',              type: 'text' },
  vendorName:     { name: 'vendorName',     label: 'Vendor (nome)',               type: 'text' },
  vendorUrl:      { name: 'vendorUrl',      label: 'Vendor (link)',               type: 'url' },
  copyrightAlign: { name: 'copyrightAlign', label: 'Alinhamento da linha de copyright', type: 'select',
    options: [
      { value: 'justify', label: 'Justify (copyright ← → vendor)' },
      { value: 'left',    label: 'Esquerda' },
      { value: 'center',  label: 'Centro' },
      { value: 'right',   label: 'Direita' },
    ]
  },
  showDarkToggle: { name: 'showDarkToggle', label: 'Botão claro/escuro no rodapé', type: 'toggle' },
}

const activeStyleSchema = computed(() =>
  activeKey.value === 'footer'
    ? { ...STYLE_SCHEMA, ...FOOTER_STYLE_SCHEMA }
    : STYLE_SCHEMA
)

const stylePanelLabel = computed(() => {
  if (activeKey.value === 'footer') return 'Estilo do rodapé'
  if (activeKey.value === 'topbar') return 'Estilo do cabeçalho'
  return 'Estilo'
})

const THEME_SCHEMA: Record<string, PropSchema> = {
  defaultColorMode: {
    name: 'defaultColorMode',
    label: 'Modo de cor padrão',
    type: 'select',
    options: [
      { value: 'system', label: 'Sistema (preferência do utilizador)' },
      { value: 'light',  label: 'Claro' },
      { value: 'dark',   label: 'Escuro' },
    ],
  },
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
  if (!globalKeys.value.length) return
  const requested = route.query.section as string | undefined
  if (requested && globalKeys.value.includes(requested)) {
    activeKey.value = requested
  } else if (!activeKey.value) {
    activeKey.value = globalKeys.value[0]
  }
})

// Scroll to + expand a specific block when ?block= / ?blockIndex= is in the URL
watch(editData, (val) => {
  if (!val || !Array.isArray(val.blocks)) return
  const targetId    = route.query.block      as string | undefined
  const targetIndex = route.query.blockIndex as string | undefined
  if (!targetId && targetIndex == null) return
  nextTick(() => setTimeout(() => {
    const el = (
      (targetId    ? document.querySelector(`[data-block-id="${targetId}"]`)       : null) ||
      (targetIndex != null ? document.querySelector(`[data-block-index="${targetIndex}"]`) : null)
    ) as HTMLElement | null
    if (!el) return
    document.querySelectorAll('[data-block-index]').forEach((card) => {
      if (card === el) return
      if (card.querySelector('[data-block-body]')) {
        (card.querySelector('[data-block-toggle]') as HTMLElement | null)?.click()
      }
    })
    if (!el.querySelector('[data-block-body]')) {
      (el.querySelector('[data-block-toggle]') as HTMLElement | null)?.click()
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'ring-offset-gray-950')
    setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2', 'ring-offset-gray-950'), 3000)
  }, 200))
}, { once: true })

const previewUrl = `/${site}/preview?path=/`

const previewMenuItems = [[
  {
    label: 'Mesma aba',
    icon: 'i-heroicons-eye',
    onSelect: () => navigateTo(previewUrl),
  },
  {
    label: 'Nova aba',
    icon: 'i-heroicons-arrow-top-right-on-square',
    onSelect: () => window.open(previewUrl, '_blank'),
  },
]]

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
      <UButtonGroup>
        <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral" @click="navigateTo(previewUrl)">
          Preview
        </UButton>
        <UDropdownMenu :items="previewMenuItems">
          <UButton icon="i-heroicons-chevron-down" size="sm" variant="outline" color="neutral" />
        </UDropdownMenu>
      </UButtonGroup>
      <UButton v-if="activeKey" icon="i-heroicons-check" size="sm" :loading="saving" @click="save">
        Salvar
      </UButton>
    </template>
  </CmsTopbar>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto p-6">
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-600" />
    </div>
    <div v-else-if="activeKey && editData">

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
                {{ stylePanelLabel }}
              </div>
              <UIcon
                :name="styleOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="w-4 h-4 text-gray-600"
              />
            </button>
            <div v-if="styleOpen" class="p-4 bg-gray-950 grid grid-cols-2 gap-4">
              <div v-for="(schema, key) in activeStyleSchema" :key="key">
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

        <!-- Theme key: dedicated defaultColorMode panel + color vars -->
        <template v-else-if="activeKey === 'theme'">
          <div class="mb-6 border border-gray-800 rounded-xl overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-3 bg-gray-900 text-sm font-medium text-gray-300">
              <UIcon name="i-heroicons-swatch" class="w-4 h-4 text-gray-500" />
              Configuração de cor
            </div>
            <div class="p-4 bg-gray-950">
              <div v-for="(schema, key) in THEME_SCHEMA" :key="key">
                <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                  {{ schema.label }}
                </label>
                <PropField
                  :field-key="key"
                  :model-value="editData[key] ?? schema.options?.[0]?.value ?? ''"
                  :schema="schema"
                  @update:model-value="editData = { ...editData, [key]: $event }"
                />
              </div>
            </div>
          </div>
          <PropForm v-model="editData" :skip-keys="Object.keys(THEME_SCHEMA)" />
        </template>

        <PropForm v-else v-model="editData" />
      </div>
    <div v-else class="flex items-center justify-center py-20 text-gray-600 text-sm">
      Selecione uma secção no menu lateral
    </div>
  </div>
</template>
