<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const site = route.params.site as string

const { data: treeData, pending } = await useAsyncData(`tree-${site}`, () =>
  api.get<{ success: boolean; tree: any[]; version: string }>(`/sites/${site}/tree`)
)

const { data: settingsData } = await useAsyncData(`settings-${site}`, () =>
  api.get<{ success: boolean; settings: any; versions: string[]; cmsConfig: any }>(`/sites/${site}/settings`)
)

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0)
}

const stats = computed(() => ({
  pages: countNodes(treeData.value?.tree || []),
  version: treeData.value?.version || "v1",
  versions: settingsData.value?.versions?.length || 1,
}))

const previewUrl = computed(() => settingsData.value?.cmsConfig?.previewUrl || "")
</script>

<template>
  <!-- Page header -->
  <div class="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-gray-800 bg-gray-900">
    <span class="text-sm font-semibold text-white">Dashboard — {{ site }}</span>
    <NuxtLink v-if="previewUrl" :to="`/${site}/preview`">
      <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral">Preview</UButton>
    </NuxtLink>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto p-6 space-y-6">
    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <UCard class="bg-gray-900 border-gray-800">
        <div class="text-2xl font-black text-white">{{ stats.pages }}</div>
        <div class="text-xs text-gray-500 uppercase tracking-wide mt-1">Páginas</div>
      </UCard>
      <UCard class="bg-gray-900 border-gray-800">
        <div class="text-2xl font-black text-primary-400">{{ stats.version }}</div>
        <div class="text-xs text-gray-500 uppercase tracking-wide mt-1">Versão Ativa</div>
      </UCard>
      <UCard class="bg-gray-900 border-gray-800">
        <div class="text-2xl font-black text-white">{{ stats.versions }}</div>
        <div class="text-xs text-gray-500 uppercase tracking-wide mt-1">Camadas</div>
      </UCard>
    </div>

    <!-- Page list -->
    <UCard class="bg-gray-900 border-gray-800">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-white">Páginas do site</span>
          <NuxtLink :to="`/${site}/settings`">
            <UButton icon="i-heroicons-cog-6-tooth" size="xs" variant="ghost" color="neutral" />
          </NuxtLink>
        </div>
      </template>

      <div v-if="pending" class="py-8 flex justify-center">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-500" />
      </div>
      <PageTree v-else :nodes="treeData?.tree || []" :site="site" />
    </UCard>
  </div>
</template>
