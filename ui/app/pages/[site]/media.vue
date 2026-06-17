<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route  = useRoute()
const toast  = useToast()
const config = useRuntimeConfig()
const api    = useApi()

const site    = route.params.site as string
const apiBase = config.public.apiBase as string

// ── View / sort ──────────────────────────────────────────
type ViewMode = "thumbnail" | "list"
type SortKey  = "name" | "size"
const viewMode = ref<ViewMode>("thumbnail")
const sortKey  = ref<SortKey>("name")
const sortAsc  = ref(true)

function toggleSort(key: SortKey) {
  if (sortKey.value === key) { sortAsc.value = !sortAsc.value } else { sortKey.value = key; sortAsc.value = true }
}

// ── Navigation ───────────────────────────────────────────
const currentPath = ref("")

const breadcrumbs = computed(() =>
  currentPath.value
    ? currentPath.value.split("/").map((part, i, arr) => ({ label: part, path: arr.slice(0, i + 1).join("/") }))
    : []
)

function navigateTo(path: string) { currentPath.value = path; selected.value.clear() }
function navigateUp() {
  const parts = currentPath.value.split("/")
  currentPath.value = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
  selected.value.clear()
}

// ── Fetch ─────────────────────────────────────────────────
interface MediaItem {
  type: "file" | "folder"
  name: string
  path: string
  size?: number
  ext?: string
  isImage?: boolean
  isVideo?: boolean
  isAudio?: boolean
}

const items   = ref<MediaItem[]>([])
const pending = ref(false)

async function fetchItems() {
  pending.value = true
  try {
    const res = await api.get<{ items: MediaItem[] }>(`/sites/${site}/media?path=${encodeURIComponent(currentPath.value)}`)
    items.value = res.items || []
  } catch { items.value = [] }
  finally { pending.value = false }
}

onMounted(fetchItems)
watch(currentPath, fetchItems)

// ── Search & type filter ──────────────────────────────────
const search     = ref("")
type TypeFilter  = "all" | "image" | "video" | "audio" | "doc"
const typeFilter = ref<TypeFilter>("all")

const typeFilters: { key: TypeFilter; label: string; icon: string }[] = [
  { key: "all",   label: "Todos",    icon: "i-heroicons-squares-2x2" },
  { key: "image", label: "Imagens",  icon: "i-heroicons-photo" },
  { key: "video", label: "Vídeos",   icon: "i-heroicons-film" },
  { key: "audio", label: "Áudio",    icon: "i-heroicons-musical-note" },
  { key: "doc",   label: "Docs",     icon: "i-heroicons-document-text" },
]

function matchesType(item: MediaItem): boolean {
  if (typeFilter.value === "all") return true
  if (typeFilter.value === "image") return !!item.isImage
  if (typeFilter.value === "video") return !!item.isVideo
  if (typeFilter.value === "audio") return !!item.isAudio
  if (typeFilter.value === "doc")   return !item.isImage && !item.isVideo && !item.isAudio
  return true
}

const folders = computed(() =>
  items.value
    .filter(i => i.type === "folder" && (!search.value || i.name.toLowerCase().includes(search.value.toLowerCase())))
)

const files = computed(() => {
  let list = items.value.filter(i => i.type === "file" && matchesType(i))
  if (search.value) list = list.filter(i => i.name.toLowerCase().includes(search.value.toLowerCase()))
  list = [...list].sort((a, b) => {
    const cmp = sortKey.value === "name"
      ? a.name.localeCompare(b.name)
      : (a.size ?? 0) - (b.size ?? 0)
    return sortAsc.value ? cmp : -cmp
  })
  return list
})

const totalSize = computed(() =>
  items.value.filter(i => i.type === "file").reduce((s, i) => s + (i.size ?? 0), 0)
)
const totalFiles = computed(() => items.value.filter(i => i.type === "file").length)

// ── Selection ─────────────────────────────────────────────
const selected  = ref(new Set<string>())
const selecting = computed(() => selected.value.size > 0)

function toggleSelect(path: string) {
  if (selected.value.has(path)) { selected.value.delete(path) } else { selected.value.add(path) }
  selected.value = new Set(selected.value)
}

function selectAll() {
  if (selected.value.size === files.value.length) { selected.value.clear() }
  else { selected.value = new Set(files.value.map(f => f.path)) }
  selected.value = new Set(selected.value)
}

function clearSelection() { selected.value.clear(); selected.value = new Set() }

const bulkDeleting = ref(false)

async function bulkDelete() {
  if (!selected.value.size) return
  bulkDeleting.value = true
  let errors = 0
  for (const path of selected.value) {
    try { await api.del(`/sites/${site}/media?path=${encodeURIComponent(path)}`) }
    catch { errors++ }
  }
  if (errors) toast.add({ title: `${errors} erro(s) ao eliminar.`, color: "error" })
  else toast.add({ title: `${selected.value.size} ficheiro(s) eliminado(s).`, color: "success" })
  selected.value.clear()
  selected.value = new Set()
  await fetchItems()
  bulkDeleting.value = false
}

// ── Upload ────────────────────────────────────────────────
const fileInputRef  = ref<HTMLInputElement>()
const uploading     = ref(false)
const uploadingName = ref("")
const uploadProgress = ref({ done: 0, total: 0 })
const dragOver      = ref(false)

async function handleFiles(fileList: FileList | null) {
  if (!fileList?.length) return
  uploading.value = true
  uploadProgress.value = { done: 0, total: fileList.length }
  try {
    for (const file of Array.from(fileList)) {
      uploadingName.value = file.name
      const fd = new FormData()
      fd.append("file", file)
      fd.append("path", currentPath.value)
      const res = await fetch(`${apiBase}/sites/${site}/media/upload`, { method: "POST", credentials: "include", body: fd })
      if (!res.ok) throw new Error("Upload failed")
      uploadProgress.value.done++
    }
    toast.add({ title: `${fileList.length} ficheiro(s) carregado(s).`, color: "success" })
    await fetchItems()
  } catch { toast.add({ title: "Erro ao carregar ficheiro.", color: "error" }) }
  finally {
    uploading.value = false; uploadingName.value = ""
    uploadProgress.value = { done: 0, total: 0 }
    if (fileInputRef.value) fileInputRef.value.value = ""
  }
}

function onDrop(e: DragEvent) { dragOver.value = false; handleFiles(e.dataTransfer?.files ?? null) }

// ── New folder ────────────────────────────────────────────
const showNewFolder   = ref(false)
const newFolderName   = ref("")
const creatingFolder  = ref(false)

async function submitNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  creatingFolder.value = true
  try {
    const folderPath = currentPath.value ? `${currentPath.value}/${name}` : name
    const fd = new FormData()
    fd.append("path", folderPath)
    fd.append("createFolder", "1")
    const blob = new Blob([""], { type: "text/plain" })
    fd.set("file", new File([blob], ".gitkeep", { type: "text/plain" }))
    await fetch(`${apiBase}/sites/${site}/media/upload`, { method: "POST", credentials: "include", body: fd })
    toast.add({ title: "Pasta criada.", color: "success" })
    showNewFolder.value = false; newFolderName.value = ""
    await fetchItems()
  } catch { toast.add({ title: "Erro ao criar pasta.", color: "error" }) }
  finally { creatingFolder.value = false }
}

// ── Rename ────────────────────────────────────────────────
const renameTarget = ref<MediaItem | null>(null)
const renameValue  = ref("")
const showRename   = computed({ get: () => !!renameTarget.value, set: (v) => { if (!v) renameTarget.value = null } })

function startRename(item: MediaItem) { renameTarget.value = item; renameValue.value = item.name }

async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try {
    await api.put(`/sites/${site}/media/rename`, { path: renameTarget.value.path, newName: renameValue.value.trim() })
    toast.add({ title: "Renomeado.", color: "success" })
    renameTarget.value = null; await fetchItems()
  } catch { toast.add({ title: "Erro ao renomear.", color: "error" }) }
}

// ── Delete ────────────────────────────────────────────────
const deleteTarget = ref<MediaItem | null>(null)
const showDelete   = computed({ get: () => !!deleteTarget.value, set: (v) => { if (!v) deleteTarget.value = null } })
const deleting     = ref(false)

function startDelete(item: MediaItem) { deleteTarget.value = item }

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.del(`/sites/${site}/media?path=${encodeURIComponent(deleteTarget.value.path)}`)
    toast.add({ title: "Eliminado.", color: "success" })
    deleteTarget.value = null; await fetchItems()
  } catch { toast.add({ title: "Erro ao eliminar.", color: "error" }) }
  finally { deleting.value = false }
}

// ── Move ──────────────────────────────────────────────────
const moveTarget      = ref<MediaItem | null>(null)
const moveDestination = ref("")
const showMove        = computed({ get: () => !!moveTarget.value, set: (v) => { if (!v) moveTarget.value = null } })

function startMove(item: MediaItem) { moveTarget.value = item; moveDestination.value = currentPath.value }

async function confirmMove() {
  if (!moveTarget.value) return
  try {
    await api.put(`/sites/${site}/media/move`, { path: moveTarget.value.path, destination: moveDestination.value })
    toast.add({ title: "Movido.", color: "success" })
    moveTarget.value = null; await fetchItems()
  } catch { toast.add({ title: "Erro ao mover.", color: "error" }) }
}

// ── Copy ──────────────────────────────────────────────────
async function copyItem(item: MediaItem) {
  try {
    await api.put(`/sites/${site}/media/copy`, { path: item.path })
    toast.add({ title: "Cópia criada.", color: "success" }); await fetchItems()
  } catch { toast.add({ title: "Erro ao copiar.", color: "error" }) }
}

// ── Zoom / Video / PDF ──────────────────────────────────
const zoomItem  = ref<MediaItem | null>(null)
const videoItem = ref<MediaItem | null>(null)
const pdfItem   = ref<MediaItem | null>(null)

function closeAll() { zoomItem.value = null; videoItem.value = null; pdfItem.value = null }

onMounted(() => window.addEventListener("keydown", e => { if (e.key === "Escape") closeAll() }))

// ── Helpers ──────────────────────────────────────────────
function thumbUrl(item: MediaItem) {
  return `${apiBase}/sites/${site}/media/serve?path=${encodeURIComponent(item.path)}`
}

function fileIcon(item: MediaItem) {
  if (item.isVideo) return "i-heroicons-film"
  if (item.isAudio) return "i-heroicons-musical-note"
  if (item.ext === ".pdf") return "i-heroicons-document-text"
  return "i-heroicons-document"
}

function fileIconColor(item: MediaItem) {
  if (item.isVideo) return "text-purple-400"
  if (item.isAudio) return "text-green-400"
  if (item.ext === ".pdf") return "text-red-400"
  return "text-gray-400"
}

function formatSize(bytes?: number) {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function fileType(item: MediaItem) {
  if (item.isImage) return "Imagem"
  if (item.isVideo) return "Vídeo"
  if (item.isAudio) return "Áudio"
  if (item.ext === ".pdf") return "PDF"
  return item.ext?.replace(".", "").toUpperCase() || "Ficheiro"
}

function copyUrl(item: MediaItem) {
  navigator.clipboard.writeText(thumbUrl(item))
  toast.add({ title: "URL copiado.", color: "success" })
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <button
        class="px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors font-medium text-sm"
        :class="!currentPath ? 'text-white' : 'text-gray-400 hover:text-white'"
        @click="navigateTo('')"
      >Media</button>
      <template v-for="crumb in breadcrumbs" :key="crumb.path">
        <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
        <button
          class="px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors truncate max-w-32 text-sm"
          :class="crumb.path === currentPath ? 'text-white font-medium' : 'text-gray-400 hover:text-white'"
          @click="navigateTo(crumb.path)"
        >{{ crumb.label }}</button>
      </template>
    </template>

    <template #actions>
      <!-- Search -->
      <div class="relative">
        <UIcon name="i-heroicons-magnifying-glass" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
        <input
          v-model="search"
          type="search"
          placeholder="Pesquisar…"
          class="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-44"
        />
      </div>

      <!-- View toggle -->
      <div class="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
        <button
          :class="viewMode === 'thumbnail' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          class="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          title="Miniaturas"
          @click="viewMode = 'thumbnail'"
        ><UIcon name="i-heroicons-squares-2x2" class="w-4 h-4" /></button>
        <button
          :class="viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          class="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
          title="Lista"
          @click="viewMode = 'list'"
        ><UIcon name="i-heroicons-bars-3" class="w-4 h-4" /></button>
      </div>

      <UButton icon="i-heroicons-folder-plus" size="sm" color="neutral" variant="ghost" @click="showNewFolder = true">
        Nova pasta
      </UButton>

      <input ref="fileInputRef" type="file" multiple class="hidden" accept="image/*,video/*,audio/*,.pdf,.svg"
        @change="handleFiles(($event.target as HTMLInputElement).files)" />
      <UButton icon="i-heroicons-arrow-up-tray" size="sm" :loading="uploading" @click="fileInputRef?.click()">
        Upload
      </UButton>
    </template>
  </CmsTopbar>

  <!-- Upload progress -->
  <div v-if="uploading" class="flex items-center gap-3 px-5 py-2 bg-primary-500/10 text-xs text-primary-400 flex-shrink-0 border-b border-primary-500/20">
    <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin flex-shrink-0" />
    <span class="flex-1 truncate">{{ uploadingName }}</span>
    <span class="text-primary-500 font-mono tabular-nums">{{ uploadProgress.done }}/{{ uploadProgress.total }}</span>
  </div>

  <!-- Type filter + sort bar -->
  <div class="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900/60">
    <!-- Type tabs -->
    <div class="flex items-center gap-0.5">
      <button
        v-for="tf in typeFilters"
        :key="tf.key"
        :class="typeFilter === tf.key
          ? 'bg-gray-800 text-white'
          : 'text-gray-500 hover:text-gray-300'"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
        @click="typeFilter = tf.key"
      >
        <UIcon :name="tf.icon" class="w-3.5 h-3.5" />
        {{ tf.label }}
      </button>
    </div>

    <div class="flex items-center gap-3">
      <!-- Bulk actions -->
      <div v-if="selecting" class="flex items-center gap-2">
        <span class="text-xs text-gray-400">{{ selected.size }} selecionado(s)</span>
        <UButton size="xs" color="neutral" variant="ghost" @click="clearSelection">Cancelar</UButton>
        <UButton size="xs" icon="i-heroicons-trash" color="error" variant="ghost" :loading="bulkDeleting" @click="bulkDelete">
          Eliminar
        </UButton>
      </div>

      <!-- Sort (list view) -->
      <div v-if="viewMode === 'list'" class="flex items-center gap-1">
        <button
          :class="sortKey === 'name' ? 'text-white' : 'text-gray-500 hover:text-gray-300'"
          class="text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors flex items-center gap-1"
          @click="toggleSort('name')"
        >
          Nome
          <UIcon v-if="sortKey === 'name'" :name="sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
        </button>
        <button
          :class="sortKey === 'size' ? 'text-white' : 'text-gray-500 hover:text-gray-300'"
          class="text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors flex items-center gap-1"
          @click="toggleSort('size')"
        >
          Tamanho
          <UIcon v-if="sortKey === 'size'" :name="sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
        </button>
      </div>
    </div>
  </div>

  <!-- Content area -->
  <div
    class="flex-1 overflow-auto relative"
    @dragover.prevent="dragOver = true"
    @dragleave.self="dragOver = false"
    @drop.prevent="onDrop"
  >
    <!-- Drag overlay -->
    <Transition name="fade">
      <div
        v-if="dragOver"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-primary-500/10 border-2 border-dashed border-primary-500 pointer-events-none"
      >
        <UIcon name="i-heroicons-arrow-up-tray" class="w-12 h-12 text-primary-400 mb-3" />
        <p class="text-primary-300 font-medium">Largar ficheiros aqui</p>
      </div>
    </Transition>

    <!-- Loading -->
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
    </div>

    <!-- Empty root -->
    <div
      v-else-if="!folders.length && !files.length && !search"
      class="flex flex-col items-center justify-center py-24 gap-4"
    >
      <div class="w-20 h-20 rounded-2xl bg-gray-800/60 flex items-center justify-center">
        <UIcon name="i-heroicons-photo" class="w-10 h-10 text-gray-600" />
      </div>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-400">Sem ficheiros de media</p>
        <p class="text-xs text-gray-600 mt-1">Arraste ficheiros ou use o botão Upload</p>
      </div>
      <UButton icon="i-heroicons-arrow-up-tray" size="sm" @click="fileInputRef?.click()">Upload</UButton>
    </div>

    <!-- No search results -->
    <div v-else-if="!folders.length && !files.length && search" class="flex flex-col items-center justify-center py-20 gap-2">
      <UIcon name="i-heroicons-magnifying-glass" class="w-8 h-8 text-gray-600" />
      <p class="text-sm text-gray-500">Nenhum resultado para "{{ search }}"</p>
      <UButton size="xs" variant="ghost" color="neutral" @click="search = ''">Limpar pesquisa</UButton>
    </div>

    <!-- ── THUMBNAIL VIEW ─────────────────────────────────── -->
    <div v-else-if="viewMode === 'thumbnail'" class="p-5">
      <!-- Select-all strip when some files exist -->
      <div v-if="files.length > 1" class="flex items-center justify-between mb-3">
        <button
          class="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1.5"
          @click="selectAll"
        >
          <UIcon :name="selected.size === files.length ? 'i-heroicons-check-circle' : 'i-heroicons-circle'" class="w-3.5 h-3.5" />
          {{ selected.size === files.length ? 'Desselecionar todos' : 'Selecionar todos' }}
        </button>
        <span v-if="folders.length || files.length" class="text-[11px] text-gray-600">
          {{ folders.length ? `${folders.length} pasta(s) · ` : '' }}{{ files.length }} ficheiro(s)
        </span>
      </div>

      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))">
        <!-- Up -->
        <button
          v-if="currentPath"
          class="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors aspect-square justify-center border border-gray-800/60"
          @click="navigateUp"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-6 h-6" />
          <span class="text-xs">Voltar</span>
        </button>

        <!-- Folders -->
        <button
          v-for="item in folders"
          :key="item.path"
          class="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors aspect-square justify-center border border-transparent hover:border-gray-700 relative"
          @click="navigateTo(item.path)"
        >
          <UIcon name="i-heroicons-folder" class="w-12 h-12 text-yellow-500/70 group-hover:text-yellow-500/90 transition-colors" />
          <span class="text-xs truncate w-full text-center leading-tight">{{ item.name }}</span>
          <!-- Folder actions -->
          <div class="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900 text-gray-400 hover:text-white transition-colors"
              title="Renomear"
              @click.stop="startRename(item)"
            ><UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" /></button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900 text-red-500 hover:text-red-400 transition-colors"
              title="Eliminar"
              @click.stop="startDelete(item)"
            ><UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" /></button>
          </div>
        </button>

        <!-- Files -->
        <div
          v-for="item in files"
          :key="item.path"
          class="relative flex flex-col rounded-xl overflow-hidden border transition-all duration-150 group"
          :class="selected.has(item.path)
            ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/40'
            : 'border-transparent hover:border-gray-700 hover:bg-gray-800/40'"
        >
          <!-- Preview area -->
          <div
            class="flex-1 bg-gray-800/60 flex items-center justify-center overflow-hidden"
            style="aspect-ratio: 1"
            :class="item.isImage ? 'cursor-zoom-in' : (item.isVideo || item.ext === '.pdf') ? 'cursor-pointer' : ''"
            @click="item.isImage ? (zoomItem = item) : (item.isVideo ? (videoItem = item) : (item.ext === '.pdf' ? (pdfItem = item) : undefined))"
          >
            <img
              v-if="item.isImage"
              :src="thumbUrl(item)"
              :alt="item.name"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div v-else class="flex flex-col items-center gap-2">
              <UIcon :name="fileIcon(item)" :class="['w-10 h-10', fileIconColor(item)]" />
              <span class="text-[10px] text-gray-500 uppercase font-mono">{{ item.ext?.replace('.', '') }}</span>
            </div>

            <!-- Play badge for video -->
            <div v-if="item.isVideo" class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                <UIcon name="i-heroicons-play" class="w-5 h-5 text-white ml-0.5" />
              </div>
            </div>
          </div>

          <!-- File name + size -->
          <div class="px-2 py-1.5 bg-gray-900/80 border-t border-gray-800/60">
            <p class="text-[11px] text-gray-300 truncate leading-tight">{{ item.name }}</p>
            <p class="text-[10px] text-gray-600">{{ formatSize(item.size) }}</p>
          </div>

          <!-- Checkbox (top-left) -->
          <button
            class="absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center border transition-all"
            :class="selected.has(item.path)
              ? 'bg-primary-500 border-primary-500 opacity-100'
              : 'bg-gray-900/80 border-gray-600 opacity-0 group-hover:opacity-100'"
            @click.stop="toggleSelect(item.path)"
          >
            <UIcon v-if="selected.has(item.path)" name="i-heroicons-check" class="w-3 h-3 text-white" />
          </button>

          <!-- Hover actions (top-right) -->
          <div class="absolute top-1.5 right-1.5 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900/90 text-gray-400 hover:text-white transition-colors"
              title="Copiar URL"
              @click.stop="copyUrl(item)"
            ><UIcon name="i-heroicons-link" class="w-3.5 h-3.5" /></button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900/90 text-gray-400 hover:text-white transition-colors"
              title="Renomear"
              @click.stop="startRename(item)"
            ><UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" /></button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900/90 text-gray-400 hover:text-white transition-colors"
              title="Mover"
              @click.stop="startMove(item)"
            ><UIcon name="i-heroicons-arrows-right-left" class="w-3.5 h-3.5" /></button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900/90 text-gray-400 hover:text-white transition-colors"
              title="Duplicar"
              @click.stop="copyItem(item)"
            ><UIcon name="i-heroicons-document-duplicate" class="w-3.5 h-3.5" /></button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded bg-gray-900/90 text-red-500 hover:text-red-400 transition-colors"
              title="Eliminar"
              @click.stop="startDelete(item)"
            ><UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── LIST VIEW ──────────────────────────────────────── -->
    <div v-else class="p-5">
      <div class="border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
              <th class="px-3 py-2.5 w-8">
                <button
                  class="w-4 h-4 rounded border border-gray-600 flex items-center justify-center transition-colors"
                  :class="selected.size === files.length && files.length ? 'bg-primary-500 border-primary-500' : 'hover:border-gray-400'"
                  @click="selectAll"
                >
                  <UIcon v-if="selected.size === files.length && files.length" name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
                </button>
              </th>
              <th class="px-3 py-2.5 w-10" />
              <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <button class="flex items-center gap-1 hover:text-gray-300 transition-colors" @click="toggleSort('name')">
                  Nome
                  <UIcon :name="sortKey === 'name' ? (sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down') : 'i-heroicons-chevron-up-down'" class="w-3 h-3 opacity-50" />
                </button>
              </th>
              <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Tipo</th>
              <th class="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell text-right">
                <button class="flex items-center gap-1 hover:text-gray-300 transition-colors ml-auto" @click="toggleSort('size')">
                  Tamanho
                  <UIcon :name="sortKey === 'size' ? (sortAsc ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down') : 'i-heroicons-chevron-up-down'" class="w-3 h-3 opacity-50" />
                </button>
              </th>
              <th class="px-3 py-2.5 w-40" />
            </tr>
          </thead>
          <tbody>
            <!-- Up row -->
            <tr
              v-if="currentPath"
              class="border-b border-gray-800/50 hover:bg-gray-900/40 cursor-pointer transition-colors"
              @click="navigateUp"
            >
              <td class="px-3 py-2.5" />
              <td class="px-3 py-2.5"><UIcon name="i-heroicons-arrow-left" class="w-4 h-4 text-gray-500" /></td>
              <td class="px-3 py-2.5 text-gray-400 text-xs">..</td>
              <td class="hidden md:table-cell" /><td class="hidden md:table-cell" /><td />
            </tr>

            <!-- Folders -->
            <tr
              v-for="item in folders"
              :key="item.path"
              class="border-b border-gray-800/50 hover:bg-gray-900/40 cursor-pointer transition-colors group"
              @click="navigateTo(item.path)"
            >
              <td class="px-3 py-2.5" />
              <td class="px-3 py-2.5"><UIcon name="i-heroicons-folder" class="w-5 h-5 text-yellow-500/70" /></td>
              <td class="px-3 py-2.5 font-medium text-white">{{ item.name }}</td>
              <td class="px-3 py-2.5 text-gray-500 text-xs hidden md:table-cell">Pasta</td>
              <td class="hidden md:table-cell" />
              <td class="px-3 py-2.5">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <UButton icon="i-heroicons-pencil-square" size="xs" color="neutral" variant="ghost" title="Renomear" @click.stop="startRename(item)" />
                  <UButton icon="i-heroicons-trash" size="xs" color="error" variant="ghost" title="Eliminar" @click.stop="startDelete(item)" />
                </div>
              </td>
            </tr>

            <!-- Files -->
            <tr
              v-for="item in files"
              :key="item.path"
              class="border-b border-gray-800/50 last:border-0 transition-colors group"
              :class="selected.has(item.path) ? 'bg-primary-500/10' : 'hover:bg-gray-900/40'"
            >
              <td class="px-3 py-2.5">
                <button
                  class="w-4 h-4 rounded border flex items-center justify-center transition-all"
                  :class="selected.has(item.path) ? 'bg-primary-500 border-primary-500' : 'border-gray-700 hover:border-gray-400 opacity-0 group-hover:opacity-100'"
                  @click="toggleSelect(item.path)"
                >
                  <UIcon v-if="selected.has(item.path)" name="i-heroicons-check" class="w-2.5 h-2.5 text-white" />
                </button>
              </td>
              <td class="px-3 py-2.5">
                <div
                  class="w-9 h-9 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center flex-shrink-0"
                  :class="item.isImage ? 'cursor-zoom-in' : ''"
                  @click="item.isImage ? (zoomItem = item) : undefined"
                >
                  <img v-if="item.isImage" :src="thumbUrl(item)" :alt="item.name" class="w-full h-full object-cover" loading="lazy" />
                  <UIcon v-else :name="fileIcon(item)" :class="['w-4 h-4', fileIconColor(item)]" />
                </div>
              </td>
              <td class="px-3 py-2.5 font-medium text-white max-w-xs">
                <span class="truncate block">{{ item.name }}</span>
              </td>
              <td class="px-3 py-2.5 text-gray-500 text-xs hidden md:table-cell">
                <span class="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] font-mono">{{ fileType(item) }}</span>
              </td>
              <td class="px-3 py-2.5 text-gray-500 text-xs text-right hidden md:table-cell font-mono tabular-nums">{{ formatSize(item.size) }}</td>
              <td class="px-3 py-2.5">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <UButton icon="i-heroicons-link" size="xs" color="neutral" variant="ghost" title="Copiar URL" @click.stop="copyUrl(item)" />
                  <UButton icon="i-heroicons-pencil-square" size="xs" color="neutral" variant="ghost" title="Renomear" @click.stop="startRename(item)" />
                  <UButton icon="i-heroicons-arrows-right-left" size="xs" color="neutral" variant="ghost" title="Mover" @click.stop="startMove(item)" />
                  <UButton icon="i-heroicons-document-duplicate" size="xs" color="neutral" variant="ghost" title="Duplicar" @click.stop="copyItem(item)" />
                  <UButton icon="i-heroicons-trash" size="xs" color="error" variant="ghost" title="Eliminar" @click.stop="startDelete(item)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Stats footer -->
  <div class="flex-shrink-0 border-t border-gray-800 bg-gray-900/60 px-5 py-2 flex items-center gap-4 text-[11px] text-gray-500">
    <span>{{ totalFiles }} ficheiro(s)</span>
    <span>·</span>
    <span>{{ formatSize(totalSize) }} total</span>
    <span v-if="folders.length">·</span>
    <span v-if="folders.length">{{ folders.length }} pasta(s)</span>
    <span v-if="selecting" class="ml-auto text-primary-400 font-medium">{{ selected.size }} selecionado(s)</span>
  </div>

  <!-- ── Modals ─────────────────────────────────────────────── -->
  <UModal v-model:open="showNewFolder" title="Nova pasta">
    <template #body>
      <UFormField label="Nome da pasta">
        <UInput v-model="newFolderName" placeholder="ex: imagens" autofocus class="w-full font-mono" @keyup.enter="submitNewFolder" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showNewFolder = false">Cancelar</UButton>
        <UButton icon="i-heroicons-folder-plus" :loading="creatingFolder" :disabled="!newFolderName.trim()" @click="submitNewFolder">Criar</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="showRename" title="Renomear">
    <template #body>
      <UFormField label="Novo nome">
        <UInput v-model="renameValue" class="w-full" autofocus @keyup.enter="confirmRename" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="renameTarget = null">Cancelar</UButton>
        <UButton :disabled="!renameValue.trim()" @click="confirmRename">Renomear</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="showMove" title="Mover para">
    <template #body>
      <div class="space-y-1">
        <UFormField label="Pasta de destino">
          <UInput v-model="moveDestination" class="w-full font-mono" placeholder="ex: imagens/2024" @keyup.enter="confirmMove" />
        </UFormField>
        <p class="text-xs text-gray-600">Deixar vazio para mover para a raiz.</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="moveTarget = null">Cancelar</UButton>
        <UButton @click="confirmMove">Mover</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="showDelete" title="Eliminar">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar
        <span class="font-mono text-white bg-gray-800 px-1.5 py-0.5 rounded text-xs">{{ deleteTarget?.name }}</span>?
        Esta ação não pode ser revertida.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="deleteTarget = null">Cancelar</UButton>
        <UButton icon="i-heroicons-trash" color="error" :loading="deleting" @click="confirmDelete">Eliminar</UButton>
      </div>
    </template>
  </UModal>

  <!-- Image zoom -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div v-if="zoomItem" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm" @click.self="zoomItem = null">
        <div class="relative flex flex-col items-center gap-3" style="max-width:90vw;max-height:90vh">
          <img :src="thumbUrl(zoomItem)" class="min-h-0 min-w-0 flex-shrink object-contain rounded-xl shadow-2xl ring-1 ring-white/10" style="max-width:90vw;max-height:calc(90vh - 3.5rem)" />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-document" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ zoomItem.path }}</span>
            <button class="text-gray-500 hover:text-white transition-colors flex-shrink-0" title="Copiar URL" @click="copyUrl(zoomItem!)">
              <UIcon name="i-heroicons-link" class="w-3.5 h-3.5" />
            </button>
            <a :href="thumbUrl(zoomItem)" target="_blank" class="text-gray-500 hover:text-white transition-colors flex-shrink-0" title="Abrir original">
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" />
            </a>
          </div>
          <button class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white transition-colors shadow-lg" @click="zoomItem = null">
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Video player -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div v-if="videoItem" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm" @click.self="videoItem = null">
        <div class="relative flex flex-col items-center gap-3" style="max-width:90vw;max-height:90vh">
          <video :src="thumbUrl(videoItem)" controls autoplay class="min-h-0 min-w-0 flex-shrink rounded-xl shadow-2xl ring-1 ring-white/10 bg-black" style="max-width:90vw;max-height:calc(90vh - 3.5rem)" />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-film" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ videoItem.path }}</span>
            <button class="text-gray-500 hover:text-white transition-colors flex-shrink-0" title="Copiar URL" @click="copyUrl(videoItem!)">
              <UIcon name="i-heroicons-link" class="w-3.5 h-3.5" />
            </button>
          </div>
          <button class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white transition-colors shadow-lg" @click="videoItem = null">
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- PDF viewer -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div v-if="pdfItem" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm" @click.self="pdfItem = null">
        <div class="relative flex flex-col items-center gap-3" style="width:70vw;height:70vh">
          <iframe :src="thumbUrl(pdfItem)" class="flex-shrink rounded-xl shadow-2xl ring-1 ring-white/10 bg-white" style="width:70vw;height:calc(70vh - 3.5rem)" />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ pdfItem.path }}</span>
            <button class="text-gray-500 hover:text-white transition-colors flex-shrink-0" title="Copiar URL" @click="copyUrl(pdfItem!)">
              <UIcon name="i-heroicons-link" class="w-3.5 h-3.5" />
            </button>
            <a :href="thumbUrl(pdfItem)" target="_blank" class="text-gray-500 hover:text-white transition-colors flex-shrink-0" title="Abrir em nova aba">
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" />
            </a>
          </div>
          <button class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white transition-colors shadow-lg" @click="pdfItem = null">
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.zoom-fade-enter-active, .zoom-fade-leave-active { transition: opacity 0.2s ease; }
.zoom-fade-enter-active .relative, .zoom-fade-leave-active .relative { transition: transform 0.2s ease, opacity 0.2s ease; }
.zoom-fade-enter-from, .zoom-fade-leave-to { opacity: 0; }
.zoom-fade-enter-from .relative { transform: scale(0.93); opacity: 0; }
.zoom-fade-leave-to .relative { transform: scale(0.93); opacity: 0; }
</style>
