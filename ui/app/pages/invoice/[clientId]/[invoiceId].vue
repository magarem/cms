<script setup lang="ts">
definePageMeta({ layout: false })

const route  = useRoute()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase as string

const { clientId, invoiceId } = route.params as { clientId: string; invoiceId: string }
const token = route.query.token as string | undefined

const { data, error } = await useFetch<{
  success: boolean
  client:  { name: string }
  invoice: {
    id: string
    description: string
    items: { label: string; amount: number }[]
    total: number
    status: string
    dueDate?: string
    paidAt?: string
    createdAt: string
    paymentUrl?: string
  }
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
}>(`${apiBase}/public/invoice/${clientId}/${invoiceId}`, {
  query: { token },
})

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : ""

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendente",
  paid:      "Pago",
  overdue:   "Vencida",
  cancelled: "Cancelada",
}

const STATUS_CLASS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  paid:      "bg-green-100  text-green-800",
  overdue:   "bg-red-100    text-red-800",
  cancelled: "bg-gray-100   text-gray-600",
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-10 px-4">

    <!-- Error state -->
    <div v-if="error || data?.error" class="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
      <div class="text-4xl mb-4">⚠️</div>
      <h1 class="text-lg font-semibold text-gray-800 mb-2">Fatura indisponível</h1>
      <p class="text-sm text-gray-500">{{ data?.error || "Não foi possível carregar a fatura. O link pode ser inválido ou expirado." }}</p>
    </div>

    <!-- Invoice card -->
    <div v-else-if="data?.success" class="max-w-2xl w-full bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none">

      <!-- Header -->
      <div class="px-8 py-6 border-b border-gray-100">
        <div class="flex items-start justify-between gap-6">
          <!-- Vendor info -->
          <div>
            <img
              v-if="data.vendor.logo"
              :src="data.vendor.logo"
              alt="Logo"
              class="h-10 max-w-[200px] object-contain mb-3"
            />
            <div v-else class="font-black text-xl tracking-widest uppercase text-gray-900 mb-3">
              {{ data.vendor.name }}
            </div>
            <div class="text-xs text-gray-500 space-y-0.5">
              <div v-if="data.vendor.address">{{ data.vendor.address }}</div>
              <div v-if="data.vendor.phone || data.vendor.email">
                {{ [data.vendor.phone, data.vendor.email].filter(Boolean).join("  ·  ") }}
              </div>
              <div v-if="data.vendor.website">{{ data.vendor.website }}</div>
              <div v-if="data.vendor.taxId" class="text-gray-400">{{ data.vendor.taxId }}</div>
            </div>
          </div>

          <!-- Invoice number + status -->
          <div class="text-right flex-shrink-0">
            <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">Fatura</div>
            <div class="text-2xl font-black text-gray-800">#{{ data.invoice.id }}</div>
            <span
              class="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
              :class="STATUS_CLASS[data.invoice.status] || 'bg-gray-100 text-gray-600'"
            >
              {{ STATUS_LABEL[data.invoice.status] || data.invoice.status }}
            </span>
          </div>
        </div>
      </div>

      <!-- Client + dates -->
      <div class="px-8 py-5 bg-gray-50 border-b border-gray-100 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">Para</div>
          <div class="font-semibold text-gray-800">{{ data.client.name }}</div>
        </div>
        <div class="text-right">
          <div v-if="data.invoice.dueDate" class="mb-1">
            <span class="text-xs text-gray-400 uppercase tracking-widest">Vencimento</span>
            <div class="font-medium text-gray-700">{{ fmtDate(data.invoice.dueDate) }}</div>
          </div>
          <div v-if="data.invoice.paidAt">
            <span class="text-xs text-gray-400 uppercase tracking-widest">Pago em</span>
            <div class="font-medium text-green-700">{{ fmtDate(data.invoice.paidAt) }}</div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="px-8 pt-6 pb-2">
        <p class="text-sm text-gray-600 font-medium">{{ data.invoice.description }}</p>
      </div>

      <!-- Items table -->
      <div class="px-8 pb-6">
        <table class="w-full text-sm mt-4">
          <thead>
            <tr class="border-b border-gray-200 text-xs text-gray-400 uppercase tracking-widest">
              <th class="pb-2 text-left font-medium">Descrição</th>
              <th class="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in data.invoice.items"
              :key="item.label"
              class="border-b border-gray-100 last:border-0"
            >
              <td class="py-2.5 text-gray-700">{{ item.label }}</td>
              <td class="py-2.5 text-right text-gray-700 tabular-nums">{{ fmt(item.amount) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-gray-900">
              <td class="pt-3 font-bold text-gray-900">Total</td>
              <td class="pt-3 text-right font-black text-gray-900 tabular-nums text-base">
                {{ fmt(data.invoice.total) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Pay button -->
      <div
        v-if="data.invoice.paymentUrl && data.invoice.status !== 'paid' && data.invoice.status !== 'cancelled'"
        class="px-8 pb-8 flex justify-center"
      >
        <a
          :href="data.invoice.paymentUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-white text-base transition-opacity hover:opacity-90 active:opacity-80"
          style="background-color: #009ee3;"
        >
          <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M40 16H8C5.79 16 4 17.79 4 20V36C4 38.21 5.79 40 8 40H40C42.21 40 44 38.21 44 36V20C44 17.79 42.21 16 40 16Z" fill="white" fill-opacity="0.3"/>
            <path d="M4 22H44V28H4V22Z" fill="white" fill-opacity="0.5"/>
            <rect x="8" y="32" width="8" height="4" rx="1" fill="white"/>
          </svg>
          Pagar com Mercado Pago
        </a>
      </div>

      <!-- Footer -->
      <div class="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-400">
        Emitido por <span class="font-medium text-gray-600">{{ data.vendor.name }}</span>
        · Emissão: {{ fmtDate(data.invoice.createdAt) }}
      </div>
    </div>

    <!-- Loading -->
    <div v-else class="flex items-center gap-3 text-gray-400 mt-20">
      <svg class="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <span class="text-sm">A carregar fatura…</span>
    </div>

  </div>
</template>
