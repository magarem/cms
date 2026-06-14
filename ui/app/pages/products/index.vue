<script setup lang="ts">
definePageMeta({ layout: "root" })

const api   = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData(
  "products-list",
  () => api.get<{ success: boolean; products: any[] }>("/admin/products"),
  { server: false }
)

const products = computed(() => data.value?.products || [])
const search   = ref("")
const typeFilter = ref<"all" | "product" | "service">("all")

const filtered = computed(() => {
  let list = products.value
  if (typeFilter.value !== "all") list = list.filter(p => p.type === typeFilter.value)
  const q = search.value.toLowerCase()
  if (q) list = list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
  return list
})

// ── Create / Edit modal ───────────────────────────────────
const showModal   = ref(false)
const editingId   = ref<string | null>(null)
const saving      = ref(false)
const form = ref({
  type:        "service" as "product" | "service",
  name:        "",
  description: "",
  price:       0,
  unit:        "mês",
})

const UNITS = ["mês", "hora", "projeto", "unidade", "ano", "outro"]

function openCreate() {
  editingId.value = null
  form.value = { type: "service", name: "", description: "", price: 0, unit: "mês" }
  showModal.value = true
}

function openEdit(p: any) {
  editingId.value = p.id
  form.value = { type: p.type, name: p.name, description: p.description || "", price: p.price, unit: p.unit || "mês" }
  showModal.value = true
}

async function save() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    if (editingId.value) {
      await api.put(`/admin/products/${editingId.value}`, form.value)
      toast.add({ title: "Produto atualizado.", color: "success" })
    } else {
      await api.post("/admin/products", form.value)
      toast.add({ title: "Produto criado.", color: "success" })
    }
    showModal.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}

async function toggleActive(p: any) {
  try {
    await api.put(`/admin/products/${p.id}`, { active: !p.active })
    await refresh()
  } catch {
    toast.add({ title: "Erro.", color: "error" })
  }
}

async function remove(p: any) {
  try {
    await api.del(`/admin/products/${p.id}`)
    toast.add({ title: "Removido.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao remover.", color: "error" })
  }
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  product: { label: "Produto",  icon: "i-heroicons-cube",   color: "text-blue-400" },
  service: { label: "Serviço",  icon: "i-heroicons-wrench", color: "text-violet-400" },
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <div>
        <h1 class="text-lg font-semibold text-white">Produtos & Serviços</h1>
        <p class="text-xs text-gray-500 mt-0.5">{{ products.length }} ite{{ products.length !== 1 ? 'ns' : 'm' }} no catálogo</p>
      </div>
      <div class="flex items-center gap-3">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass"
          placeholder="Pesquisar…"
          size="sm"
          class="w-56"
        />
        <UButton icon="i-heroicons-plus" size="sm" @click="openCreate">
          Novo item
        </UButton>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="flex-shrink-0 flex items-center gap-1 px-6 pt-3 pb-0 border-b border-gray-800">
      <button
        v-for="f in [['all','Todos'],['service','Serviços'],['product','Produtos']]"
        :key="f[0]"
        class="px-3 py-2 text-sm border-b-2 transition-colors mr-1"
        :class="typeFilter === f[0]
          ? 'border-primary-500 text-primary-400 font-medium'
          : 'border-transparent text-gray-500 hover:text-gray-300'"
        @click="typeFilter = f[0] as any"
      >
        {{ f[1] }}
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-auto p-6">
      <div v-if="filtered.length === 0" class="text-center py-24">
        <UIcon name="i-heroicons-cube" class="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <p class="text-gray-500 text-sm mb-4">
          {{ search ? "Nenhum item encontrado." : "Catálogo vazio." }}
        </p>
        <UButton v-if="!search" icon="i-heroicons-plus" size="sm" @click="openCreate">
          Criar primeiro item
        </UButton>
      </div>

      <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Preço</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unidade</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in filtered"
              :key="p.id"
              class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors"
              :class="!p.active ? 'opacity-50' : ''"
            >
              <td class="px-4 py-3">
                <div class="font-medium text-white">{{ p.name }}</div>
                <div v-if="p.description" class="text-xs text-gray-500 mt-0.5 line-clamp-1">{{ p.description }}</div>
              </td>
              <td class="px-4 py-3">
                <span class="flex items-center gap-1.5 text-xs" :class="TYPE_LABELS[p.type]?.color">
                  <UIcon :name="TYPE_LABELS[p.type]?.icon || 'i-heroicons-tag'" class="w-3.5 h-3.5" />
                  {{ TYPE_LABELS[p.type]?.label || p.type }}
                </span>
              </td>
              <td class="px-4 py-3 font-mono font-semibold text-white">{{ fmtMoney(p.price) }}</td>
              <td class="px-4 py-3 text-gray-400 text-xs">{{ p.unit || '—' }}</td>
              <td class="px-4 py-3">
                <UBadge
                  :label="p.active ? 'Ativo' : 'Inativo'"
                  :color="p.active ? 'success' : 'neutral'"
                  variant="subtle"
                  size="xs"
                />
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    :icon="p.active ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :title="p.active ? 'Desativar' : 'Ativar'"
                    @click="toggleActive(p)"
                  />
                  <UButton
                    icon="i-heroicons-pencil-square"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="openEdit(p)"
                  />
                  <UButton
                    icon="i-heroicons-trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    @click="remove(p)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Create / Edit modal -->
  <UModal v-model:open="showModal" :title="editingId ? 'Editar item' : 'Novo produto ou serviço'">
    <template #body>
      <div class="space-y-4">
        <!-- Type selector -->
        <UFormField label="Tipo">
          <div class="flex gap-2">
            <button
              v-for="opt in [['service','Serviço','i-heroicons-wrench'],['product','Produto','i-heroicons-cube']]"
              :key="opt[0]"
              class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors"
              :class="form.type === opt[0]
                ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'"
              @click="form.type = opt[0] as any"
            >
              <UIcon :name="opt[2]" class="w-4 h-4" />
              {{ opt[1] }}
            </button>
          </div>
        </UFormField>

        <UFormField label="Nome" required>
          <UInput v-model="form.name" placeholder="Ex: Desenvolvimento de Site, Hospedagem Anual…" autofocus class="w-full" />
        </UFormField>

        <UFormField label="Descrição">
          <UTextarea v-model="form.description" placeholder="Detalhe o que está incluído…" :rows="2" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Preço (BRL)">
            <UInput v-model.number="form.price" type="number" placeholder="0,00" class="w-full" />
          </UFormField>
          <UFormField label="Unidade">
            <USelect
              v-model="form.unit"
              :items="UNITS.map(u => ({ label: u, value: u }))"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="bg-gray-800/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <span class="text-sm text-gray-400">Preço final</span>
          <span class="font-mono font-bold text-white">
            {{ new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(form.price) }}
            <span class="text-xs text-gray-500 font-normal ml-1">/ {{ form.unit }}</span>
          </span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showModal = false">Cancelar</UButton>
        <UButton icon="i-heroicons-check" :loading="saving" :disabled="!form.name.trim()" @click="save">
          {{ editingId ? "Salvar" : "Criar" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
