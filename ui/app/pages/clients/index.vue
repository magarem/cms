<script setup lang="ts">
definePageMeta({ layout: "root" })

const api   = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData(
  "clients-list",
  () => api.get<{ success: boolean; clients: any[] }>("/admin/clients"),
  { server: false }
)

const clients  = computed(() => data.value?.clients || [])
const search   = ref("")
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return clients.value.filter(c =>
    c.name?.toLowerCase().includes(q) ||
    c.email?.toLowerCase().includes(q) ||
    c.phone?.includes(q)
  )
})

// ── Create modal ──────────────────────────────────────────
const showCreate = ref(false)
const saving     = ref(false)
const form       = ref({ name: "", email: "", phone: "", address: "", notes: "" })

async function create() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    const res = await api.post<{ client: any }>("/admin/clients", form.value)
    toast.add({ title: "Cliente criado.", color: "success" })
    showCreate.value = false
    form.value = { name: "", email: "", phone: "", address: "", notes: "" }
    await refresh()
    navigateTo(`/clients/${res.client.id}`)
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar.", color: "error" })
  } finally {
    saving.value = false
  }
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header bar -->
    <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <div>
        <h1 class="text-lg font-semibold text-white">Clientes</h1>
        <p class="text-xs text-gray-500 mt-0.5">{{ clients.length }} conta{{ clients.length !== 1 ? 's' : '' }}</p>
      </div>
      <div class="flex items-center gap-3">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass"
          placeholder="Pesquisar clientes…"
          size="sm"
          class="w-64"
        />
        <UButton icon="i-heroicons-user-plus" size="sm" @click="showCreate = true">
          Nova conta
        </UButton>
      </div>
    </div>

    <!-- Client list -->
    <div class="flex-1 overflow-auto p-6">
      <!-- Empty state -->
      <div v-if="filtered.length === 0" class="text-center py-24">
        <UIcon name="i-heroicons-building-office" class="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <p class="text-gray-500 text-sm mb-4">
          {{ search ? "Nenhum cliente encontrado." : "Ainda não há contas de clientes." }}
        </p>
        <UButton v-if="!search" icon="i-heroicons-user-plus" size="sm" @click="showCreate = true">
          Criar primeira conta
        </UButton>
      </div>

      <!-- Grid of client cards -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <NuxtLink
          v-for="client in filtered"
          :key="client.id"
          :to="`/clients/${client.id}`"
          class="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 hover:bg-gray-900/80 transition-all group"
        >
          <!-- Avatar -->
          <div class="flex items-start justify-between mb-4">
            <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-lg shadow-primary-500/20">
              {{ initials(client.name) }}
            </div>
            <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors mt-1" />
          </div>

          <h2 class="font-semibold text-white text-sm leading-tight mb-1 truncate">{{ client.name }}</h2>
          <p v-if="client.email" class="text-xs text-gray-500 truncate mb-3">{{ client.email }}</p>
          <p v-if="client.phone" class="text-xs text-gray-600 truncate mb-3">{{ client.phone }}</p>

          <div class="flex items-center gap-3 text-xs text-gray-600 pt-3 border-t border-gray-800">
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-globe-alt" class="w-3 h-3" />
              {{ (client.sites || []).length }} site{{ (client.sites || []).length !== 1 ? 's' : '' }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-document-text" class="w-3 h-3" />
              {{ (client.invoices || []).length }} fatura{{ (client.invoices || []).length !== 1 ? 's' : '' }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-heroicons-chat-bubble-left-ellipsis" class="w-3 h-3" />
              {{ (client.support || []).filter((t: any) => t.status === 'open').length }} aberto{{ (client.support || []).filter((t: any) => t.status === 'open').length !== 1 ? 's' : '' }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreate" title="Nova conta de cliente">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Nome completo" required>
          <UInput v-model="form.name" placeholder="Nome do cliente ou empresa" autofocus class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Email">
            <UInput v-model="form.email" type="email" placeholder="email@exemplo.com" class="w-full" />
          </UFormField>
          <UFormField label="Telefone / WhatsApp">
            <UInput v-model="form.phone" placeholder="+55 11 99999-9999" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Endereço">
          <UInput v-model="form.address" placeholder="Rua, número, cidade, estado" class="w-full" />
        </UFormField>
        <UFormField label="Notas internas">
          <UTextarea v-model="form.notes" placeholder="Observações sobre o cliente…" :rows="3" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showCreate = false">Cancelar</UButton>
        <UButton icon="i-heroicons-user-plus" :loading="saving" :disabled="!form.name.trim()" @click="create">
          Criar conta
        </UButton>
      </div>
    </template>
  </UModal>
</template>
