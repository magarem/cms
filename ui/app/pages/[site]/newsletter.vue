<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route  = useRoute()
const api    = useApi()
const toast  = useToast()
const site   = route.params.site as string

const { data, pending, refresh } = await useAsyncData(`newsletter-${site}`, () =>
  api.get<{ subscribers: { email: string; subscribedAt: string; source?: string }[] }>(
    `/sites/${site}/newsletter`
  )
)

const subscribers = computed(() => data.value?.subscribers || [])

const search = ref("")
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return subscribers.value
  return subscribers.value.filter(s => s.email.includes(q))
})

const removing = ref<string | null>(null)

async function remove(email: string) {
  removing.value = email
  try {
    await api.del(`/sites/${site}/newsletter?email=${encodeURIComponent(email)}`)
    toast.add({ title: "Subscriber removido.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao remover.", color: "error" })
  } finally {
    removing.value = null
  }
}

function exportCsv() {
  const rows = [
    "email,subscribedAt,source",
    ...subscribers.value.map(s =>
      `${s.email},${s.subscribedAt},${s.source || ""}`
    ),
  ]
  const blob = new Blob([rows.join("\n")], { type: "text/csv" })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement("a"), { href: url, download: `${site}-newsletter.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })
  } catch { return iso }
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Newsletter</span>
    </template>
    <template #actions>
      <UButton
        icon="i-heroicons-arrow-down-tray"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="!subscribers.length"
        @click="exportCsv"
      >
        Exportar CSV
      </UButton>
      <UButton icon="i-heroicons-arrow-path" size="sm" color="neutral" variant="ghost" :loading="pending" @click="refresh" />
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-y-auto p-6 space-y-4">

    <!-- Stats bar -->
    <div class="flex items-center gap-6 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-envelope" class="w-4 h-4 text-primary-400" />
        <span class="text-sm text-gray-400">Total de subscribers</span>
        <span class="text-sm font-bold text-white">{{ subscribers.length }}</span>
      </div>
      <div v-if="search && filtered.length !== subscribers.length" class="flex items-center gap-2 text-xs text-gray-500">
        <UIcon name="i-heroicons-funnel" class="w-3 h-3" />
        {{ filtered.length }} resultado{{ filtered.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Search -->
    <UInput
      v-model="search"
      placeholder="Pesquisar email..."
      icon="i-heroicons-magnifying-glass"
      class="w-full max-w-sm"
    />

    <!-- Table -->
    <div class="rounded-xl border border-gray-800 overflow-hidden">
      <div v-if="pending" class="flex justify-center py-16">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-600" />
      </div>

      <div v-else-if="!filtered.length" class="flex flex-col items-center justify-center py-16 gap-2 text-gray-600">
        <UIcon name="i-heroicons-envelope-open" class="w-10 h-10 opacity-30" />
        <span class="text-sm">{{ search ? 'Nenhum resultado.' : 'Ainda não há subscribers.' }}</span>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="bg-gray-900 border-b border-gray-800 text-left">
            <th class="px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500 font-medium">Email</th>
            <th class="px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500 font-medium">Data</th>
            <th class="px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500 font-medium">Origem</th>
            <th class="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/60">
          <tr
            v-for="sub in filtered"
            :key="sub.email"
            class="bg-gray-950 hover:bg-gray-900 transition-colors"
          >
            <td class="px-4 py-3 font-mono text-gray-300">{{ sub.email }}</td>
            <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{{ formatDate(sub.subscribedAt) }}</td>
            <td class="px-4 py-3 text-gray-500 text-xs">{{ sub.source || '—' }}</td>
            <td class="px-4 py-3 text-right">
              <UButton
                icon="i-heroicons-trash"
                size="xs"
                color="error"
                variant="ghost"
                :loading="removing === sub.email"
                @click="remove(sub.email)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>
