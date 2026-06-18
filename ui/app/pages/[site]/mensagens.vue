<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api   = useApi()
const toast = useToast()
const site  = route.params.site as string

interface Message {
  id: string
  receivedAt: string
  status: 'novo' | 'lido' | 'respondido'
  fields: Record<string, string>
}

const { data, pending, refresh } = await useAsyncData(
  `mensagens-${site}`,
  () => api.get<{ success: boolean; messages: Message[]; unread: number }>(`/sites/${site}/messages`),
  { server: false }
)

const messages = computed<Message[]>(() =>
  (data.value?.messages || []).slice().sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  )
)

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Field helpers ──────────────────────────────────────────────
function getSenderName(fields: Record<string, string>) {
  return fields.nome || fields.name || ''
}

function getSenderEmail(fields: Record<string, string>) {
  return fields.email || ''
}

function getPreview(fields: Record<string, string>) {
  const msg = fields.mensagem || fields.message || fields.assunto || ''
  return msg.length > 80 ? msg.slice(0, 80) + '…' : msg
}

function fieldLabel(key: string) {
  const map: Record<string, string> = {
    nome: 'Nome', name: 'Nome', email: 'Email',
    mensagem: 'Mensagem', message: 'Mensagem',
    assunto: 'Assunto', telefone: 'Telefone',
    phone: 'Telefone', whatsapp: 'WhatsApp',
    empresa: 'Empresa', company: 'Empresa',
    website: 'Website', url: 'Website',
  }
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1)
}

// ── Detail slide-over ──────────────────────────────────────────
const showDetail  = ref(false)
const detailItem  = ref<Message | null>(null)
const updating    = ref(false)

async function openDetail(msg: Message) {
  detailItem.value = msg
  showDetail.value = true
  // Auto-mark as read when opened if still "novo"
  if (msg.status === 'novo') {
    await updateStatus(msg, 'lido', { silent: true })
  }
}

async function updateStatus(msg: Message, status: string, opts?: { silent?: boolean }) {
  updating.value = true
  try {
    await api.put(`/sites/${site}/messages/${msg.id}`, { status })
    // Optimistically patch the local data
    if (detailItem.value?.id === msg.id) {
      detailItem.value = { ...detailItem.value, status: status as Message['status'] }
    }
    await refresh()
    if (!opts?.silent) {
      const label = status === 'lido' ? 'lido' : 'respondido'
      toast.add({ title: `Marcado como ${label}.`, color: 'success' })
    }
  } catch (e: any) {
    if (!opts?.silent) toast.add({ title: e.data?.error || 'Erro ao atualizar estado.', color: 'error' })
  } finally {
    updating.value = false
  }
}

// ── Delete ─────────────────────────────────────────────────────
const showDelete  = ref(false)
const deletingId  = ref<string | null>(null)
const deleting    = ref(false)

function openDeleteConfirm() {
  showDelete.value = true
}

function openDeleteFromDetail() {
  showDetail.value = false
  deletingId.value = detailItem.value?.id || null
  showDelete.value = true
}

async function confirmDelete() {
  const id = deletingId.value
  if (!id) return
  deleting.value = true
  try {
    await api.del(`/sites/${site}/messages/${id}`)
    toast.add({ title: 'Mensagem eliminada.', color: 'success' })
    showDelete.value  = false
    showDetail.value  = false
    detailItem.value  = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || 'Erro ao eliminar.', color: 'error' })
  } finally {
    deleting.value = false
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
      <span class="text-white font-medium">Mensagens</span>
      <UBadge v-if="data?.unread" color="primary" variant="subtle" size="xs" class="ml-1">
        {{ data.unread }} novas
      </UBadge>
    </template>
    <template #actions>
      <UButton
        icon="i-heroicons-arrow-path"
        size="sm"
        color="neutral"
        variant="ghost"
        :loading="pending"
        @click="refresh"
      >
        Atualizar
      </UButton>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">

    <!-- Loading -->
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-600" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!messages.length" class="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div class="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
        <UIcon name="i-heroicons-inbox" class="w-7 h-7 text-gray-600" />
      </div>
      <div>
        <p class="text-gray-400 font-medium">Nenhuma mensagem recebida ainda.</p>
        <p class="text-gray-600 text-sm mt-1">As mensagens dos formulários do site aparecerão aqui.</p>
      </div>
    </div>

    <!-- Messages table -->
    <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Estado</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remetente</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Mensagem</th>
            <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Data</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="msg in messages"
            :key="msg.id"
            class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors cursor-pointer"
            :class="msg.status === 'novo' ? 'bg-primary-500/5' : ''"
            @click="openDetail(msg)"
          >
            <!-- Status badge -->
            <td class="px-4 py-3">
              <UBadge
                :color="msg.status === 'novo' ? 'primary' : msg.status === 'respondido' ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ msg.status === 'novo' ? 'Novo' : msg.status === 'respondido' ? 'Respondido' : 'Lido' }}
              </UBadge>
            </td>

            <!-- Sender -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                  {{ (getSenderName(msg.fields) || getSenderEmail(msg.fields) || '?')[0]?.toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div
                    class="font-medium truncate transition-colors"
                    :class="msg.status === 'novo' ? 'text-white' : 'text-gray-300'"
                  >
                    {{ getSenderName(msg.fields) || getSenderEmail(msg.fields) || '(sem nome)' }}
                  </div>
                  <div v-if="getSenderName(msg.fields) && getSenderEmail(msg.fields)" class="text-xs text-gray-500 truncate">
                    {{ getSenderEmail(msg.fields) }}
                  </div>
                </div>
              </div>
            </td>

            <!-- Preview -->
            <td class="px-4 py-3 hidden md:table-cell">
              <span class="text-gray-500 text-xs">{{ getPreview(msg.fields) || '—' }}</span>
            </td>

            <!-- Date -->
            <td class="px-4 py-3 hidden lg:table-cell">
              <span class="text-gray-500 text-xs">{{ fmtDate(msg.receivedAt) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ═══ Detail modal ════════════════════════════════════════ -->
  <UModal v-model:open="showDetail" :ui="{ width: 'sm:max-w-lg' }">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-envelope-open" class="w-5 h-5 text-gray-400" />
        <span class="text-white font-semibold">
          {{ getSenderName(detailItem?.fields || {}) || getSenderEmail(detailItem?.fields || {}) || 'Mensagem' }}
        </span>
        <UBadge
          v-if="detailItem"
          :color="detailItem.status === 'novo' ? 'primary' : detailItem.status === 'respondido' ? 'success' : 'neutral'"
          variant="subtle"
          size="xs"
        >
          {{ detailItem.status === 'novo' ? 'Novo' : detailItem.status === 'respondido' ? 'Respondido' : 'Lido' }}
        </UBadge>
      </div>
    </template>

    <template #body>
      <div v-if="detailItem" class="space-y-5">
        <!-- Date -->
        <p class="text-xs text-gray-500 flex items-center gap-1.5">
          <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
          {{ fmtDate(detailItem.receivedAt) }}
        </p>

        <div class="border-t border-gray-800" />

        <!-- Dynamic fields as definition list -->
        <dl class="space-y-4">
          <div v-for="(value, key) in detailItem.fields" :key="key">
            <dt class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{{ fieldLabel(String(key)) }}</dt>
            <dd
              class="text-gray-200 text-sm whitespace-pre-wrap break-words"
              :class="(String(key) === 'mensagem' || String(key) === 'message') ? 'bg-gray-800/50 rounded-lg p-3 border border-gray-700/50' : ''"
            >{{ value || '—' }}</dd>
          </div>
        </dl>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full flex-wrap gap-2">
        <!-- Left: actions -->
        <div class="flex items-center gap-2 flex-wrap">
          <UButton
            v-if="detailItem?.status !== 'lido' && detailItem?.status !== 'respondido'"
            icon="i-heroicons-eye"
            size="sm"
            color="neutral"
            variant="outline"
            :loading="updating"
            @click="detailItem && updateStatus(detailItem, 'lido')"
          >
            Marcar como lido
          </UButton>
          <UButton
            v-if="detailItem?.status !== 'respondido'"
            icon="i-heroicons-check-circle"
            size="sm"
            color="success"
            variant="outline"
            :loading="updating"
            @click="detailItem && updateStatus(detailItem, 'respondido')"
          >
            Marcar como respondido
          </UButton>
          <a
            v-if="getSenderEmail(detailItem?.fields || {})"
            :href="`mailto:${getSenderEmail(detailItem?.fields || {})}`"
            target="_blank"
          >
            <UButton icon="i-heroicons-paper-airplane" size="sm" color="primary" variant="outline">
              Responder por email
            </UButton>
          </a>
        </div>

        <!-- Right: delete + close -->
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-trash"
            size="sm"
            color="error"
            variant="ghost"
            @click="openDeleteFromDetail"
          >
            Eliminar
          </UButton>
          <UButton variant="ghost" color="neutral" @click="showDetail = false">Fechar</UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- ═══ Delete confirmation modal ═══════════════════════════ -->
  <UModal v-model:open="showDelete" title="Eliminar mensagem">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar esta mensagem?
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
