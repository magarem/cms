<script setup lang="ts">
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

const globalKeys = computed(() => Object.keys(data.value?.global || {}))

watch(activeKey, (key) => {
  if (key && data.value?.global[key]) {
    editData.value = JSON.parse(JSON.stringify(data.value.global[key].data))
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
        <PropForm v-model="editData" />
      </div>
      <div v-else class="flex items-center justify-center py-20 text-gray-600 text-sm">
        Selecione um ficheiro à esquerda
      </div>
    </div>
  </div>
</template>
