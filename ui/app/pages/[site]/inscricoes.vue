<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()
const site = route.params.site as string

const { data, pending, refresh } = await useAsyncData(
  `inscricoes-${site}`,
  () => api.get<{ inscricoes: any[] }>(`/sites/${site}/inscricoes`),
  { server: false }
)

const inscricoes = computed(() => data.value?.inscricoes || [])

const search = ref("")

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return inscricoes.value
  return inscricoes.value.filter(i =>
    i.nome?.toLowerCase().includes(q) ||
    i.email?.toLowerCase().includes(q) ||
    i.whatsapp?.includes(q)
  )
})

const PAGAMENTO_LABEL: Record<string, string> = {
  pix:    'PIX',
  cartao: 'Cartão',
  boleto: 'Boleto',
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtNascimento(val: string) {
  if (!val) return '—'
  const [y, m, d] = val.split('-')
  if (!y || !m || !d) return val
  return `${d}/${m}/${y}`
}

// ── Detail modal ─────────────────────────────────────────────
const showDetail = ref(false)
const detailItem = ref<any>(null)

function openDetail(item: any) {
  detailItem.value = item
  showDetail.value = true
}

function openDeleteFromDetail() {
  showDetail.value = false
  openDelete(detailItem.value)
}

// ── Delete ────────────────────────────────────────────────────
const showDelete = ref(false)
const deletingId = ref<string | null>(null)
const deletingNome = ref('')
const deleting = ref(false)

function openDelete(item: any) {
  deletingId.value = item.id
  deletingNome.value = item.nome
  showDelete.value = true
}

async function confirmDelete() {
  if (!deletingId.value) return
  deleting.value = true
  try {
    await api.del(`/sites/${site}/inscricoes?id=${encodeURIComponent(deletingId.value)}`)
    toast.add({ title: 'Inscrição eliminada.', color: 'success' })
    showDelete.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || 'Erro ao eliminar.', color: 'error' })
  } finally {
    deleting.value = false
  }
}

// ── CSV export ────────────────────────────────────────────────
function exportCsv() {
  const cols = ['Nome', 'Email', 'WhatsApp', 'Nascimento', 'CPF', 'Endereço', 'Pagamento', 'Data de inscrição']
  const rows = inscricoes.value.map(i => [
    i.nome, i.email, i.whatsapp,
    fmtNascimento(i.nascimento), i.cpf, i.endereco,
    PAGAMENTO_LABEL[i.metodoPagamento] || i.metodoPagamento,
    fmtDate(i.inscritoEm),
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))

  const csv = [cols.join(','), ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inscricoes-${site}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Inscrições</span>
      <UBadge v-if="inscricoes.length" color="primary" variant="subtle" size="xs" class="ml-1">
        {{ inscricoes.length }}
      </UBadge>
    </template>
    <template #actions>
      <UButton
        icon="i-heroicons-arrow-down-tray"
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="!inscricoes.length"
        @click="exportCsv"
      >
        Exportar CSV
      </UButton>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">

    <!-- Search -->
    <div class="mb-4 max-w-xs">
      <UInput
        v-model="search"
        icon="i-heroicons-magnifying-glass"
        placeholder="Pesquisar por nome, email ou WhatsApp…"
        size="sm"
      />
    </div>

    <!-- Empty states -->
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-600" />
    </div>

    <div v-else-if="!inscricoes.length" class="text-center text-gray-600 py-20 text-sm">
      Nenhuma inscrição registada ainda.
    </div>

    <div v-else-if="!filtered.length" class="text-center text-gray-600 py-20 text-sm">
      Nenhum resultado para "{{ search }}".
    </div>

    <!-- Table -->
    <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Dados pessoais</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Endereço</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pagamento</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Inscrito em</th>
            <th class="px-4 py-3 w-12" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filtered"
            :key="item.id"
            class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors cursor-pointer"
            @click="openDetail(item)"
          >
            <!-- Nome -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                  {{ item.nome?.[0]?.toUpperCase() }}
                </div>
                <span class="font-medium text-white hover:text-primary-400 transition-colors">{{ item.nome }}</span>
              </div>
            </td>

            <!-- Contacto -->
            <td class="px-4 py-3">
              <div class="space-y-0.5">
                <div class="text-gray-300 text-xs">{{ item.email }}</div>
                <div class="text-gray-500 text-xs">{{ item.whatsapp }}</div>
              </div>
            </td>

            <!-- Dados pessoais -->
            <td class="px-4 py-3 hidden lg:table-cell">
              <div class="space-y-0.5">
                <div class="text-gray-400 text-xs">{{ fmtNascimento(item.nascimento) }}</div>
                <div class="text-gray-500 text-xs font-mono">{{ item.cpf || '—' }}</div>
              </div>
            </td>

            <!-- Endereço -->
            <td class="px-4 py-3 hidden xl:table-cell">
              <span class="text-gray-400 text-xs">{{ item.endereco || '—' }}</span>
            </td>

            <!-- Pagamento -->
            <td class="px-4 py-3">
              <UBadge
                :color="item.metodoPagamento === 'pix' ? 'success' : item.metodoPagamento === 'cartao' ? 'info' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ PAGAMENTO_LABEL[item.metodoPagamento] || item.metodoPagamento }}
              </UBadge>
            </td>

            <!-- Data -->
            <td class="px-4 py-3 hidden md:table-cell">
              <span class="text-gray-500 text-xs">{{ fmtDate(item.inscritoEm) }}</span>
            </td>

            <!-- Actions -->
            <td class="px-4 py-3" @click.stop>
              <UButton
                icon="i-heroicons-trash"
                size="xs"
                color="error"
                variant="ghost"
                title="Eliminar inscrição"
                @click="openDelete(item)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="filtered.length && filtered.length !== inscricoes.length" class="mt-3 text-xs text-gray-600">
      A mostrar {{ filtered.length }} de {{ inscricoes.length }} inscrições.
    </p>
  </div>

  <!-- Detail modal -->
  <UModal v-model:open="showDetail" :title="detailItem?.nome" :ui="{ width: 'sm:max-w-md' }">
    <template #body>
      <div v-if="detailItem" class="space-y-5">

        <!-- Avatar + name -->
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-full bg-primary-500/20 flex items-center justify-center text-2xl font-bold text-primary-400 flex-shrink-0">
            {{ detailItem.nome?.[0]?.toUpperCase() }}
          </div>
          <div>
            <p class="text-lg font-semibold text-white leading-tight">{{ detailItem.nome }}</p>
            <p class="text-xs text-gray-500 font-mono mt-0.5">{{ detailItem.id }}</p>
          </div>
        </div>

        <div class="border-t border-gray-800" />

        <!-- Fields -->
        <dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Email</dt>
            <dd class="text-gray-200 break-all">{{ detailItem.email }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">WhatsApp</dt>
            <dd class="text-gray-200">{{ detailItem.whatsapp || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Nascimento</dt>
            <dd class="text-gray-200">{{ fmtNascimento(detailItem.nascimento) }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">CPF</dt>
            <dd class="text-gray-200 font-mono">{{ detailItem.cpf || '—' }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Endereço</dt>
            <dd class="text-gray-200">{{ detailItem.endereco || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Pagamento</dt>
            <dd>
              <UBadge
                :color="detailItem.metodoPagamento === 'pix' ? 'success' : detailItem.metodoPagamento === 'cartao' ? 'info' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ PAGAMENTO_LABEL[detailItem.metodoPagamento] || detailItem.metodoPagamento }}
              </UBadge>
            </dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Inscrito em</dt>
            <dd class="text-gray-200">{{ fmtDate(detailItem.inscritoEm) }}</dd>
          </div>
        </dl>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-between items-center w-full">
        <UButton icon="i-heroicons-trash" color="error" variant="ghost" size="sm" @click="openDeleteFromDetail">
          Eliminar
        </UButton>
        <UButton variant="ghost" color="neutral" @click="showDetail = false">Fechar</UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation -->
  <UModal v-model:open="showDelete" title="Eliminar inscrição">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar a inscrição de
        <span class="font-semibold text-white">{{ deletingNome }}</span>?
        Esta ação não pode ser revertida.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDelete = false">Cancelar</UButton>
        <UButton icon="i-heroicons-trash" color="error" :loading="deleting" @click="confirmDelete">
          Eliminar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
