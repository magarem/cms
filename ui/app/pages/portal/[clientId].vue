<script setup lang="ts">
definePageMeta({ layout: false })

const route   = useRoute()
const config  = useRuntimeConfig()
const apiBase = config.public.apiBase as string

const { clientId } = route.params as { clientId: string }
const token = route.query.token as string | undefined

const { data, error } = await useFetch<{
  success: boolean
  client:  { name: string; email?: string; phone?: string }
  invoices: {
    id: string
    description: string
    items: { label: string; amount: number }[]
    total: number
    status: string
    dueDate?: string
    paidAt?: string
    createdAt: string
  }[]
  vendor: {
    name?: string
    logo?: string
    address?: string
    phone?: string
    email?: string
    website?: string
    taxId?: string
  }
  error?: string
}>(`${apiBase}/public/client/${clientId}`, { query: { token } })

// selected invoice for detail modal
const selected = ref<typeof data.value extends { invoices: infer I } ? I[number] : any | null>(null)

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendente",
  paid:      "Paga",
  overdue:   "Vencida",
  cancelled: "Cancelada",
}

const STATUS_BG: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-800 ring-yellow-200",
  paid:      "bg-green-50  text-green-800  ring-green-200",
  overdue:   "bg-red-50    text-red-800    ring-red-200",
  cancelled: "bg-gray-100  text-gray-500   ring-gray-200",
}

const totals = computed(() => {
  if (!data.value?.invoices) return { paid: 0, pending: 0 }
  return data.value.invoices.reduce((acc, inv) => {
    if (inv.status === "paid")    acc.paid    += inv.total
    if (inv.status === "pending" || inv.status === "overdue") acc.pending += inv.total
    return acc
  }, { paid: 0, pending: 0 })
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">

    <!-- Error state -->
    <div v-if="error || data?.error" class="flex items-center justify-center min-h-screen px-4">
      <div class="max-w-md w-full bg-white rounded-2xl shadow p-10 text-center">
        <div class="text-5xl mb-5">🔒</div>
        <h1 class="text-xl font-bold text-gray-800 mb-2">Acesso inválido</h1>
        <p class="text-sm text-gray-500">
          {{ data?.error || "Link inválido ou expirado. Solicite um novo link ao seu fornecedor." }}
        </p>
      </div>
    </div>

    <template v-else-if="data?.success">

      <!-- Top bar -->
      <div class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <!-- Vendor branding -->
          <div class="flex items-center gap-3">
            <img v-if="data.vendor.logo" :src="data.vendor.logo" alt="Logo" class="h-8 max-w-[120px] object-contain" />
            <span v-else class="font-black text-sm tracking-widest uppercase text-gray-900">{{ data.vendor.name }}</span>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-400 uppercase tracking-widest">Área do cliente</div>
            <div class="font-semibold text-gray-800 text-sm">{{ data.client.name }}</div>
          </div>
        </div>
      </div>

      <!-- Main content -->
      <div class="max-w-3xl mx-auto px-4 py-8 space-y-6">

        <!-- Summary cards -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-xl p-5 border border-gray-200">
            <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">Total pago</div>
            <div class="text-2xl font-black text-green-700">{{ fmt(totals.paid) }}</div>
          </div>
          <div class="bg-white rounded-xl p-5 border border-gray-200">
            <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">Em aberto</div>
            <div class="text-2xl font-black" :class="totals.pending > 0 ? 'text-yellow-700' : 'text-gray-400'">
              {{ fmt(totals.pending) }}
            </div>
          </div>
        </div>

        <!-- Invoice list -->
        <div>
          <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Minhas faturas</h2>

          <div v-if="!data.invoices.length" class="bg-white rounded-xl p-10 text-center text-gray-400 border border-gray-200">
            Nenhuma fatura encontrada.
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="inv in data.invoices"
              :key="inv.id"
              class="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all group"
              @click="selected = inv"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-gray-800 truncate">{{ inv.description }}</div>
                  <div class="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span>#{{ inv.id }}</span>
                    <span>·</span>
                    <span>{{ fmtDate(inv.createdAt) }}</span>
                    <span v-if="inv.dueDate">· Vence {{ fmtDate(inv.dueDate) }}</span>
                  </div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-1.5">
                  <div class="font-black text-gray-900">{{ fmt(inv.total) }}</div>
                  <span
                    class="text-xs font-semibold px-2 py-0.5 rounded-full ring-1"
                    :class="STATUS_BG[inv.status] || 'bg-gray-100 text-gray-500 ring-gray-200'"
                  >
                    {{ STATUS_LABEL[inv.status] || inv.status }}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Vendor contact footer -->
        <div class="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-500 space-y-1">
          <div class="font-semibold text-gray-700 mb-2">{{ data.vendor.name }}</div>
          <div v-if="data.vendor.address">{{ data.vendor.address }}</div>
          <div v-if="data.vendor.phone || data.vendor.email">
            {{ [data.vendor.phone, data.vendor.email].filter(Boolean).join("  ·  ") }}
          </div>
          <div v-if="data.vendor.website">{{ data.vendor.website }}</div>
          <div v-if="data.vendor.taxId" class="text-gray-400 text-xs">{{ data.vendor.taxId }}</div>
        </div>

      </div>

      <!-- Invoice detail slide-over -->
      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="selected" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4" @click.self="selected = null">
          <div class="absolute inset-0 bg-black/40" @click="selected = null" />
          <div class="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

            <!-- Header -->
            <div class="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <div class="font-bold text-gray-900">{{ selected.description }}</div>
                <div class="text-xs text-gray-400 mt-0.5">#{{ selected.id }} · {{ fmtDate(selected.createdAt) }}</div>
              </div>
              <button class="text-gray-400 hover:text-gray-600 mt-0.5" @click="selected = null">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Items -->
            <div class="overflow-y-auto flex-1 p-6">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 text-xs text-gray-400 uppercase tracking-widest">
                    <th class="pb-2 text-left font-medium">Descrição</th>
                    <th class="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in selected.items" :key="item.label" class="border-b border-gray-100 last:border-0">
                    <td class="py-2.5 text-gray-700">{{ item.label }}</td>
                    <td class="py-2.5 text-right text-gray-700 tabular-nums">{{ fmt(item.amount) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="border-t-2 border-gray-900">
                    <td class="pt-3 font-bold text-gray-900">Total</td>
                    <td class="pt-3 text-right font-black text-gray-900 tabular-nums text-base">{{ fmt(selected.total) }}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Dates + status -->
              <div class="mt-5 space-y-1.5 text-sm text-gray-500">
                <div v-if="selected.dueDate" class="flex justify-between">
                  <span>Vencimento</span><span class="text-gray-700">{{ fmtDate(selected.dueDate) }}</span>
                </div>
                <div v-if="selected.paidAt" class="flex justify-between">
                  <span>Pago em</span><span class="text-green-700 font-medium">{{ fmtDate(selected.paidAt) }}</span>
                </div>
                <div class="flex justify-between items-center pt-1">
                  <span>Status</span>
                  <span
                    class="text-xs font-semibold px-2.5 py-1 rounded-full ring-1"
                    :class="STATUS_BG[selected.status] || 'bg-gray-100 text-gray-500 ring-gray-200'"
                  >
                    {{ STATUS_LABEL[selected.status] || selected.status }}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </Transition>

    </template>

    <!-- Loading -->
    <div v-else class="flex items-center justify-center min-h-screen gap-3 text-gray-400">
      <svg class="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <span class="text-sm">A carregar…</span>
    </div>

  </div>
</template>
