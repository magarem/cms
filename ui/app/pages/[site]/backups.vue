<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route  = useRoute()
const api    = useApi()
const config = useRuntimeConfig()
const toast  = useToast()
const site   = route.params.site as string

interface Backup {
  id: string
  label: string
  createdAt: string
  size: number
  dirs: string[]
}

const { data, pending, error, refresh } = await useAsyncData(
  `backups-${site}`,
  () => api.get<{ backups: Backup[] }>(`/sites/${site}/backups`),
  { server: false }
)

const backups = computed(() => data.value?.backups || [])

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function fmtSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

// ── Create backup ─────────────────────────────────────────────
const showCreate       = ref(false)
const createLabel      = ref("")
const availableVersions = ref<string[]>([])
const availableDataDirs = ref<string[]>([])
const selectedDirs     = ref<string[]>([])
const loadingDirs      = ref(false)
const creating         = ref(false)

async function openCreate() {
  createLabel.value = ""
  showCreate.value  = true
  loadingDirs.value = true
  try {
    const res = await api.get<{ versions: string[], dataDirs: string[] }>(`/sites/${site}/versions`)
    availableVersions.value = res.versions  || []
    availableDataDirs.value  = res.dataDirs || []
    selectedDirs.value = [...availableVersions.value, ...availableDataDirs.value]
  } finally {
    loadingDirs.value = false
  }
}

function toggleDir(d: string) {
  const idx = selectedDirs.value.indexOf(d)
  if (idx === -1) selectedDirs.value.push(d)
  else selectedDirs.value.splice(idx, 1)
}

async function createBackup() {
  creating.value = true
  try {
    await api.post(`/sites/${site}/backups`, { label: createLabel.value, dirs: selectedDirs.value })
    toast.add({ title: "Backup criado com sucesso.", color: "success" })
    showCreate.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar backup.", color: "error" })
  } finally {
    creating.value = false
  }
}

// ── Download backup ───────────────────────────────────────────
const downloading = ref<string | null>(null)

async function downloadBackup(b: Backup) {
  downloading.value = b.id
  try {
    const res = await fetch(`${config.public.apiBase}/sites/${site}/backups/${b.id}/download`, {
      credentials: "include",
    })
    if (!res.ok) { toast.add({ title: "Erro ao descarregar backup.", color: "error" }); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    const label = b.label ? b.label.replace(/[^a-z0-9]/gi, "-").toLowerCase() : "backup"
    a.href     = url
    a.download = `${label}-${b.id}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ title: "Erro ao descarregar backup.", color: "error" })
  } finally {
    downloading.value = null
  }
}

// ── Restore from existing backup ──────────────────────────────
const showRestore  = ref(false)
const restoreItem  = ref<Backup | null>(null)
const restoring    = ref(false)

function openRestore(b: Backup) {
  restoreItem.value = b
  showRestore.value = true
}

async function confirmRestore() {
  if (!restoreItem.value) return
  restoring.value = true
  try {
    await api.post(`/sites/${site}/backups/${restoreItem.value.id}/restore`, {})
    toast.add({ title: "Conteúdo restaurado com sucesso.", color: "success" })
    showRestore.value = false
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao restaurar.", color: "error" })
  } finally {
    restoring.value = false
  }
}

// ── Upload zip → add to backup list ──────────────────────────
const showUpload  = ref(false)
const uploadFile  = ref<File | null>(null)
const uploading   = ref(false)

function openUpload() {
  uploadFile.value = null
  showUpload.value = true
}

function onFileChange(e: Event) {
  uploadFile.value = (e.target as HTMLInputElement).files?.[0] || null
}

async function confirmUpload() {
  if (!uploadFile.value) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append("file", uploadFile.value)
    const res = await fetch(`${config.public.apiBase}/sites/${site}/backups/upload`, {
      method:      "POST",
      credentials: "include",
      body:        form,
    })
    const data = await res.json()
    if (!res.ok) { toast.add({ title: data.error || "Erro ao importar ZIP.", color: "error" }); return }
    toast.add({ title: "Backup importado. Pode agora restaurá-lo.", color: "success" })
    showUpload.value = false
    await refresh()
  } catch {
    toast.add({ title: "Erro ao importar ZIP.", color: "error" })
  } finally {
    uploading.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────
const showDelete  = ref(false)
const deleteItem  = ref<Backup | null>(null)
const deleting    = ref(false)

function openDelete(b: Backup) {
  deleteItem.value = b
  showDelete.value = true
}

async function confirmDelete() {
  if (!deleteItem.value) return
  deleting.value = true
  try {
    await api.del(`/sites/${site}/backups/${deleteItem.value.id}`)
    toast.add({ title: "Backup eliminado.", color: "success" })
    showDelete.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao eliminar backup.", color: "error" })
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
      <span class="text-white font-medium">Backups</span>
      <UBadge v-if="backups.length" color="neutral" variant="subtle" size="xs" class="ml-1">
        {{ backups.length }}
      </UBadge>
    </template>
    <template #actions>
      <UButton size="sm" color="neutral" variant="outline" icon="i-heroicons-arrow-up-tray" @click="openUpload">
        Importar ZIP
      </UButton>
      <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="openCreate">
        Criar backup
      </UButton>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">

    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-600" />
    </div>

    <div v-else-if="error" class="text-center py-20 text-sm">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10 mx-auto mb-3 text-red-500 opacity-70" />
      <p class="font-medium text-red-400">Erro ao carregar backups.</p>
      <p class="text-xs text-gray-500 mt-1">{{ (error as any)?.data?.error || error?.message || 'Erro desconhecido' }}</p>
      <UButton size="xs" variant="ghost" color="neutral" class="mt-4" @click="refresh">Tentar novamente</UButton>
    </div>

    <div v-else-if="!backups.length" class="text-center text-gray-600 py-20 text-sm">
      <UIcon name="i-heroicons-archive-box" class="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p class="font-medium text-gray-500">Nenhum backup criado.</p>
      <p class="text-xs mt-1 opacity-70">Crie o primeiro ponto de restauro antes de fazer alterações importantes.</p>
    </div>

    <div v-else class="space-y-3 max-w-2xl">
      <div
        v-for="b in backups"
        :key="b.id"
        class="flex items-center gap-4 border border-gray-800 rounded-xl px-5 py-4 bg-gray-900/40 hover:bg-gray-900/70 transition-colors"
      >
        <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-heroicons-archive-box" class="w-5 h-5 text-primary-400" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate">
            {{ b.label || 'Ponto de restauro' }}
          </p>
          <div class="flex items-center gap-3 mt-0.5 flex-wrap">
            <span class="text-xs text-gray-500">{{ fmtDate(b.createdAt) }}</span>
            <span class="text-xs text-gray-600">·</span>
            <span class="text-xs text-gray-500">{{ fmtSize(b.size) }}</span>
            <span class="text-xs text-gray-600">·</span>
            <span class="text-xs text-gray-600 font-mono">{{ (b.dirs || []).join(', ') }}</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <UButton
            icon="i-heroicons-arrow-down-tray"
            size="xs"
            color="neutral"
            variant="ghost"
            title="Descarregar ZIP"
            :loading="downloading === b.id"
            @click="downloadBackup(b)"
          />
          <UButton
            icon="i-heroicons-arrow-path"
            size="xs"
            color="warning"
            variant="soft"
            @click="openRestore(b)"
          >
            Restaurar
          </UButton>
          <UButton
            icon="i-heroicons-trash"
            size="xs"
            color="error"
            variant="ghost"
            @click="openDelete(b)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- ── Create modal ─────────────────────────────────────── -->
  <UModal v-model:open="showCreate" title="Criar backup">
    <template #body>
      <div class="space-y-5">
        <UFormField label="Descrição (opcional)">
          <UInput
            v-model="createLabel"
            placeholder="ex: Antes da reestruturação"
            class="w-full"
            autofocus
            @keyup.enter="createBackup"
          />
        </UFormField>

        <div v-if="loadingDirs" class="flex items-center gap-2 text-gray-500 py-2">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          <span class="text-xs">A carregar pastas…</span>
        </div>

        <template v-else>
          <!-- Content versions -->
          <div v-if="availableVersions.length">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Versões de conteúdo</p>
            <div class="space-y-2">
              <label
                v-for="v in availableVersions"
                :key="v"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
                :class="selectedDirs.includes(v) ? 'border-primary-500/40 bg-primary-500/10' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900/70'"
              >
                <input type="checkbox" :checked="selectedDirs.includes(v)" class="accent-primary-500 w-4 h-4 flex-shrink-0" @change="toggleDir(v)" />
                <span class="font-mono text-sm flex-1" :class="selectedDirs.includes(v) ? 'text-white' : 'text-gray-400'">{{ v }}</span>
                <span v-if="v === 'production'" class="text-[10px] uppercase tracking-widest text-green-500 font-semibold">live</span>
              </label>
            </div>
          </div>

          <!-- Data dirs -->
          <div v-if="availableDataDirs.length">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dados do site</p>
            <div class="space-y-2">
              <label
                v-for="d in availableDataDirs"
                :key="d"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
                :class="selectedDirs.includes(d) ? 'border-primary-500/40 bg-primary-500/10' : 'border-gray-800 bg-gray-900/40 hover:bg-gray-900/70'"
              >
                <input type="checkbox" :checked="selectedDirs.includes(d)" class="accent-primary-500 w-4 h-4 flex-shrink-0" @change="toggleDir(d)" />
                <span class="font-mono text-sm" :class="selectedDirs.includes(d) ? 'text-white' : 'text-gray-400'">{{ d }}</span>
              </label>
            </div>
          </div>

          <p v-if="selectedDirs.length === 0" class="text-xs text-red-400">
            Selecione pelo menos uma pasta.
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="creating" @click="showCreate = false">Cancelar</UButton>
        <UButton icon="i-heroicons-archive-box-arrow-down" color="primary" :loading="creating" :disabled="selectedDirs.length === 0 || loadingDirs" @click="createBackup">
          Criar backup
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- ── Restore existing modal ───────────────────────────── -->
  <UModal v-model:open="showRestore" title="Restaurar backup">
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p class="text-sm text-amber-200">
            Esta ação irá <strong>substituir o conteúdo atual</strong> pelo conteúdo deste backup.
            As alterações posteriores serão perdidas.
          </p>
        </div>
        <div v-if="restoreItem" class="border border-gray-800 rounded-lg px-4 py-3 bg-gray-900/50 text-sm space-y-1">
          <p class="font-medium text-white">{{ restoreItem.label || 'Ponto de restauro' }}</p>
          <p class="text-gray-500 text-xs">{{ fmtDate(restoreItem.createdAt) }} · {{ fmtSize(restoreItem.size) }}</p>
          <p class="text-gray-600 text-xs font-mono">{{ (restoreItem.dirs || []).join(', ') }}</p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="restoring" @click="showRestore = false">Cancelar</UButton>
        <UButton icon="i-heroicons-arrow-path" color="warning" :loading="restoring" @click="confirmRestore">Restaurar agora</UButton>
      </div>
    </template>
  </UModal>

  <!-- ── Upload zip modal ─────────────────────────────────── -->
  <UModal v-model:open="showUpload" title="Importar backup ZIP">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-gray-400">
          O ZIP será importado como um ponto de restauro e ficará visível na lista de backups.
          Pode depois restaurá-lo como qualquer outro backup.
        </p>
        <div>
          <input
            type="file"
            accept=".zip"
            class="block w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 cursor-pointer"
            @change="onFileChange"
          />
          <p v-if="uploadFile" class="text-xs text-gray-500 mt-1.5">{{ uploadFile.name }} · {{ fmtSize(uploadFile.size) }}</p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="uploading" @click="showUpload = false">Cancelar</UButton>
        <UButton
          icon="i-heroicons-arrow-up-tray"
          color="primary"
          :loading="uploading"
          :disabled="!uploadFile"
          @click="confirmUpload"
        >
          Importar
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- ── Delete modal ──────────────────────────────────────── -->
  <UModal v-model:open="showDelete" title="Eliminar backup">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar o backup
        <span class="font-semibold text-white">{{ deleteItem?.label || 'sem descrição' }}</span>?
        Esta ação não pode ser revertida.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="deleting" @click="showDelete = false">Cancelar</UButton>
        <UButton icon="i-heroicons-trash" color="error" :loading="deleting" @click="confirmDelete">Eliminar</UButton>
      </div>
    </template>
  </UModal>
</template>
