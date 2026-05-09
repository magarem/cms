<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const toast = useToast()
const config = useRuntimeConfig()
const api = useApi()

const site = route.params.site as string
const apiBase = config.public.apiBase as string

// ── View mode ────────────────────────────────────────────────
type ViewMode = "thumbnail" | "list"
const viewMode = ref<ViewMode>("thumbnail")

// ── Navigation ───────────────────────────────────────────────
const currentPath = ref("")

const breadcrumbs = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split("/").map((part, i, arr) => ({
    label: part,
    path: arr.slice(0, i + 1).join("/"),
  }))
})

function navigateTo(path: string) { currentPath.value = path }
function navigateUp() {
  const parts = currentPath.value.split("/")
  currentPath.value = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
}

// ── Fetch ─────────────────────────────────────────────────────
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

const items = ref<MediaItem[]>([])
const pending = ref(false)

async function fetchItems() {
  pending.value = true
  try {
    const res = await api.get<{ items: MediaItem[] }>(
      `/sites/${site}/media?path=${encodeURIComponent(currentPath.value)}`
    )
    items.value = res.items || []
  } catch {
    items.value = []
  } finally {
    pending.value = false
  }
}

onMounted(fetchItems)
watch(currentPath, fetchItems)

const folders = computed(() => items.value.filter(i => i.type === "folder"))
const files = computed(() => items.value.filter(i => i.type === "file"))

// ── Upload ────────────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement>()
const uploading = ref(false)
const uploadingName = ref("")
const dragOver = ref(false)

async function handleFiles(fileList: FileList | null) {
  if (!fileList?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(fileList)) {
      uploadingName.value = file.name
      const fd = new FormData()
      fd.append("file", file)
      fd.append("path", currentPath.value)
      const res = await fetch(`${apiBase}/sites/${site}/media/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      })
      if (!res.ok) throw new Error("Upload failed")
    }
    toast.add({ title: `${fileList.length} ficheiro(s) carregado(s).`, color: "success" })
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao carregar ficheiro.", color: "error" })
  } finally {
    uploading.value = false
    uploadingName.value = ""
    if (fileInputRef.value) fileInputRef.value.value = ""
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

// ── New folder ────────────────────────────────────────────────
const showNewFolder = ref(false)
const newFolderName = ref("")
const creatingFolder = ref(false)

async function submitNewFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  creatingFolder.value = true
  try {
    const folderPath = currentPath.value ? `${currentPath.value}/${name}` : name
    const fd = new FormData()
    fd.append("path", folderPath)
    fd.append("createFolder", "1")
    // Use a dummy 0-byte upload trick — or call a dedicated endpoint if available.
    // We create it by uploading a hidden .gitkeep via the upload endpoint.
    const blob = new Blob([""], { type: "text/plain" })
    fd.set("file", new File([blob], ".gitkeep", { type: "text/plain" }))
    await fetch(`${apiBase}/sites/${site}/media/upload`, {
      method: "POST",
      credentials: "include",
      body: fd,
    })
    toast.add({ title: "Pasta criada.", color: "success" })
    showNewFolder.value = false
    newFolderName.value = ""
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao criar pasta.", color: "error" })
  } finally {
    creatingFolder.value = false
  }
}

// ── Rename ────────────────────────────────────────────────────
const renameTarget = ref<MediaItem | null>(null)
const renameValue = ref("")
const showRename = computed({
  get: () => !!renameTarget.value,
  set: (v) => { if (!v) renameTarget.value = null },
})

function startRename(item: MediaItem) {
  renameTarget.value = item
  renameValue.value = item.name
}

async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try {
    await api.put(`/sites/${site}/media/rename`, {
      path: renameTarget.value.path,
      newName: renameValue.value.trim(),
    })
    toast.add({ title: "Renomeado.", color: "success" })
    renameTarget.value = null
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao renomear.", color: "error" })
  }
}

// ── Delete ────────────────────────────────────────────────────
const deleteTarget = ref<MediaItem | null>(null)
const showDelete = computed({
  get: () => !!deleteTarget.value,
  set: (v) => { if (!v) deleteTarget.value = null },
})
const deleting = ref(false)

function startDelete(item: MediaItem) { deleteTarget.value = item }

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.del(`/sites/${site}/media?path=${encodeURIComponent(deleteTarget.value.path)}`)
    toast.add({ title: "Eliminado.", color: "success" })
    deleteTarget.value = null
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao eliminar.", color: "error" })
  } finally {
    deleting.value = false
  }
}

// ── Move ──────────────────────────────────────────────────────
const moveTarget = ref<MediaItem | null>(null)
const moveDestination = ref("")
const showMove = computed({
  get: () => !!moveTarget.value,
  set: (v) => { if (!v) moveTarget.value = null },
})

function startMove(item: MediaItem) {
  moveTarget.value = item
  moveDestination.value = currentPath.value
}

async function confirmMove() {
  if (!moveTarget.value) return
  try {
    await api.put(`/sites/${site}/media/move`, {
      path: moveTarget.value.path,
      destination: moveDestination.value,
    })
    toast.add({ title: "Movido.", color: "success" })
    moveTarget.value = null
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao mover.", color: "error" })
  }
}

// ── Copy ──────────────────────────────────────────────────────
async function copyItem(item: MediaItem) {
  try {
    await api.put(`/sites/${site}/media/copy`, { path: item.path })
    toast.add({ title: "Cópia criada.", color: "success" })
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao copiar.", color: "error" })
  }
}

// ── Zoom / Video / PDF ──────────────────────────────────────
const zoomSrc = ref<string | null>(null)
const zoomItem = ref<MediaItem | null>(null)
const videoSrc = ref<string | null>(null)
const videoItem = ref<MediaItem | null>(null)
const pdfSrc = ref<string | null>(null)
const pdfItem = ref<MediaItem | null>(null)

function openZoom(item: MediaItem) {
  zoomSrc.value = thumbUrl(item)
  zoomItem.value = item
}

function closeZoom() {
  zoomSrc.value = null
  zoomItem.value = null
}

function openVideo(item: MediaItem) {
  videoSrc.value = thumbUrl(item)
  videoItem.value = item
}

function closeVideo() {
  videoSrc.value = null
  videoItem.value = null
}

function openPDF(item: MediaItem) {
  pdfSrc.value = thumbUrl(item)
  pdfItem.value = item
}

function closePDF() {
  pdfSrc.value = null
  pdfItem.value = null
}

onMounted(() => {
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeZoom(); closeVideo(); closePDF() } })
})

// ── Helpers ──────────────────────────────────────────────────
function thumbUrl(item: MediaItem) {
  return `${apiBase}/sites/${site}/media/serve?path=${encodeURIComponent(item.path)}`
}

function fileIcon(item: MediaItem) {
  if (item.isVideo) return "i-heroicons-film"
  if (item.isAudio) return "i-heroicons-musical-note"
  if (item.ext === ".pdf") return "i-heroicons-document-text"
  return "i-heroicons-document"
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
  <div v-if="uploading" class="flex items-center gap-2 px-5 py-2 bg-primary-500/10 text-xs text-primary-400 flex-shrink-0 border-b border-primary-500/20">
    <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
    A carregar: {{ uploadingName }}
  </div>

  <!-- Content area with drop zone -->
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

    <!-- Empty state -->
    <div
      v-else-if="!folders.length && !files.length && !currentPath"
      class="flex flex-col items-center justify-center py-24 text-gray-600"
    >
      <UIcon name="i-heroicons-photo" class="w-14 h-14 mb-4 opacity-20" />
      <p class="text-sm font-medium text-gray-500">Sem ficheiros de media</p>
      <p class="text-xs mt-1">Arraste ficheiros ou use o botão Upload</p>
    </div>

    <!-- ── THUMBNAIL VIEW ─────────────────────────────────── -->
    <div v-else-if="viewMode === 'thumbnail'" class="p-5">
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))">
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
          class="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-800 text-gray-400 hover:text-white transition-colors aspect-square justify-center border border-transparent hover:border-gray-700"
          @click="navigateTo(item.path)"
        >
          <UIcon name="i-heroicons-folder" class="w-12 h-12 text-yellow-500/70" />
          <span class="text-xs truncate w-full text-center leading-tight">{{ item.name }}</span>
        </button>

        <!-- Files -->
        <div
          v-for="item in files"
          :key="item.path"
          class="relative flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-gray-800 transition-colors group aspect-square justify-between border border-transparent hover:border-gray-700"
        >
          <!-- Preview -->
          <button
            class="w-full flex-1 rounded-lg overflow-hidden bg-gray-800/60 flex items-center justify-center min-h-0"
            :class="item.isImage ? 'cursor-zoom-in' : ((item.isVideo || item.ext === '.pdf') ? 'cursor-pointer' : 'cursor-default')"
            @click="item.isImage ? openZoom(item) : (item.isVideo ? openVideo(item) : (item.ext === '.pdf' ? openPDF(item) : undefined))"
          >
            <img
              v-if="item.isImage"
              :src="thumbUrl(item)"
              :alt="item.name"
              class="w-full h-full object-cover"
            />
            <UIcon v-else :name="fileIcon(item)" class="w-10 h-10 text-gray-500" />
          </button>

          <span class="text-[11px] text-gray-400 truncate w-full text-center leading-tight px-1">{{ item.name }}</span>

          <!-- Hover actions overlay -->
          <div class="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <UButton icon="i-heroicons-pencil-square" size="xs" variant="solid" color="neutral" class="!p-1" title="Renomear" @click.stop="startRename(item)" />
            <UButton icon="i-heroicons-arrows-right-left" size="xs" variant="solid" color="neutral" class="!p-1" title="Mover" @click.stop="startMove(item)" />
            <UButton icon="i-heroicons-document-duplicate" size="xs" variant="solid" color="neutral" class="!p-1" title="Copiar" @click.stop="copyItem(item)" />
            <UButton icon="i-heroicons-trash" size="xs" variant="solid" color="error" class="!p-1" title="Eliminar" @click.stop="startDelete(item)" />
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
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10" />
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Tipo</th>
              <th class="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell text-right">Tamanho</th>
              <th class="px-4 py-2.5 w-32" />
            </tr>
          </thead>
          <tbody>
            <!-- Up row -->
            <tr
              v-if="currentPath"
              class="border-b border-gray-800/50 hover:bg-gray-900/40 cursor-pointer transition-colors"
              @click="navigateUp"
            >
              <td class="px-4 py-2.5">
                <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 text-gray-500" />
              </td>
              <td class="px-4 py-2.5 text-gray-400 text-xs">..</td>
              <td class="hidden md:table-cell" />
              <td class="hidden md:table-cell" />
              <td />
            </tr>

            <!-- Folders -->
            <tr
              v-for="item in folders"
              :key="item.path"
              class="border-b border-gray-800/50 hover:bg-gray-900/40 cursor-pointer transition-colors group"
              @click="navigateTo(item.path)"
            >
              <td class="px-4 py-2.5">
                <UIcon name="i-heroicons-folder" class="w-5 h-5 text-yellow-500/70" />
              </td>
              <td class="px-4 py-2.5 font-medium text-white">{{ item.name }}</td>
              <td class="px-4 py-2.5 text-gray-500 text-xs hidden md:table-cell">Pasta</td>
              <td class="hidden md:table-cell" />
              <td class="px-4 py-2.5">
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
              class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors group"
            >
              <td class="px-4 py-2.5">
                <div
                  class="w-8 h-8 rounded overflow-hidden bg-gray-800 flex items-center justify-center flex-shrink-0"
                  :class="item.isImage ? 'cursor-zoom-in' : ''"
                  @click="item.isImage ? openZoom(item) : undefined"
                >
                  <img
                    v-if="item.isImage"
                    :src="thumbUrl(item)"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                  />
                  <UIcon v-else :name="fileIcon(item)" class="w-4 h-4 text-gray-500" />
                </div>
              </td>
              <td class="px-4 py-2.5 font-medium text-white">{{ item.name }}</td>
              <td class="px-4 py-2.5 text-gray-500 text-xs hidden md:table-cell">{{ fileType(item) }}</td>
              <td class="px-4 py-2.5 text-gray-500 text-xs text-right hidden md:table-cell">{{ formatSize(item.size) }}</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <UButton icon="i-heroicons-pencil-square" size="xs" color="neutral" variant="ghost" title="Renomear" @click.stop="startRename(item)" />
                  <UButton icon="i-heroicons-arrows-right-left" size="xs" color="neutral" variant="ghost" title="Mover" @click.stop="startMove(item)" />
                  <UButton icon="i-heroicons-document-duplicate" size="xs" color="neutral" variant="ghost" title="Copiar" @click.stop="copyItem(item)" />
                  <UButton icon="i-heroicons-trash" size="xs" color="error" variant="ghost" title="Eliminar" @click.stop="startDelete(item)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ── Modals ─────────────────────────────────────────────── -->

  <!-- New folder -->
  <UModal v-model:open="showNewFolder" title="Nova pasta">
    <template #body>
      <UFormField label="Nome da pasta">
        <UInput
          v-model="newFolderName"
          placeholder="ex: imagens"
          autofocus
          class="w-full font-mono"
          @keyup.enter="submitNewFolder"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showNewFolder = false">Cancelar</UButton>
        <UButton icon="i-heroicons-folder-plus" :loading="creatingFolder" :disabled="!newFolderName.trim()" @click="submitNewFolder">
          Criar
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Rename -->
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

  <!-- Move -->
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

  <!-- Delete confirm -->
  <UModal v-model:open="showDelete" title="Eliminar ficheiro">
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
        <UButton icon="i-heroicons-trash" color="error" :loading="deleting" @click="confirmDelete">
          Eliminar
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Image zoom -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div
        v-if="zoomSrc"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        @click.self="closeZoom"
      >
        <div class="relative flex flex-col items-center gap-3" style="max-width:90vw;max-height:90vh">
          <img :src="zoomSrc" class="min-h-0 min-w-0 flex-shrink object-contain rounded-xl shadow-2xl ring-1 ring-white/10" style="max-width:90vw;max-height:calc(90vh - 3.5rem)" />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-document" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ zoomItem?.path }}</span>
            <button
              class="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              title="Copiar caminho"
              @click="zoomItem && navigator.clipboard.writeText(zoomItem.path)"
            >
              <UIcon name="i-heroicons-clipboard" class="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shadow-lg"
            @click="closeZoom"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Video player -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div
        v-if="videoSrc"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        @click.self="closeVideo"
      >
        <div class="relative flex flex-col items-center gap-3" style="max-width:90vw;max-height:90vh">
          <video
            :src="videoSrc"
            controls
            autoplay
            class="min-h-0 min-w-0 flex-shrink rounded-xl shadow-2xl ring-1 ring-white/10 bg-black"
            style="max-width:90vw;max-height:calc(90vh - 3.5rem)"
          />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-film" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ videoItem?.path }}</span>
            <button
              class="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              title="Copiar caminho"
              @click="videoItem && navigator.clipboard.writeText(videoItem.path)"
            >
              <UIcon name="i-heroicons-clipboard" class="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shadow-lg"
            @click="closeVideo"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- PDF viewer -->
  <Teleport to="body">
    <Transition name="zoom-fade">
      <div
        v-if="pdfSrc"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
        @click.self="closePDF"
      >
        <div class="relative flex flex-col items-center gap-3" style="width:70vw;height:70vh">
          <iframe
            :src="pdfSrc"
            class="min-h-0 min-w-0 flex-shrink rounded-xl shadow-2xl ring-1 ring-white/10 bg-white"
            style="width:70vw;height:calc(70vh - 3.5rem)"
          />
          <div class="flex items-center gap-2 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 max-w-full">
            <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span class="truncate">{{ pdfItem?.path }}</span>
            <button
              class="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              title="Copiar caminho"
              @click="pdfItem && navigator.clipboard.writeText(pdfItem.path)"
            >
              <UIcon name="i-heroicons-clipboard" class="w-3.5 h-3.5" />
            </button>
            <a
              v-if="pdfSrc"
              :href="pdfSrc"
              target="_blank"
              class="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              title="Abrir em nova aba"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" />
            </a>
          </div>
          <button
            class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shadow-lg"
            @click="closePDF"
          >
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
.zoom-fade-enter-from .relative { transform: scale(0.92); opacity: 0; }
.zoom-fade-leave-to .relative { transform: scale(0.92); opacity: 0; }
</style>
