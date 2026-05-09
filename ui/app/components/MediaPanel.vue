<script setup lang="ts">
const props = defineProps<{ site: string }>()

const config = useRuntimeConfig()
const api = useApi()
const apiBase = config.public.apiBase as string
const toast = useToast()

// ── Navigation ──────────────────────────────────────────
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

// ── Fetch ──────────────────────────────────────────
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
      `/sites/${props.site}/media?path=${encodeURIComponent(currentPath.value)}`
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

// ── Upload ──────────────────────────────────────────
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const uploadingName = ref("")

async function handleFiles(fileList: FileList | null) {
  if (!fileList?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(fileList)) {
      uploadingName.value = file.name
      const fd = new FormData()
      fd.append("file", file)
      fd.append("path", currentPath.value)
      const res = await fetch(`${apiBase}/sites/${props.site}/media/upload`, {
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
    if (fileInput.value) fileInput.value.value = ""
  }
}

// drag-and-drop
const dragOver = ref(false)
function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

// ── Delete ──────────────────────────────────────────
async function deleteItem(item: MediaItem) {
  try {
    await api.del(`/sites/${props.site}/media?path=${encodeURIComponent(item.path)}`)
    toast.add({ title: "Eliminado.", color: "success" })
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao eliminar.", color: "error" })
  }
}

// ── Rename ──────────────────────────────────────────
const renameTarget = ref<MediaItem | null>(null)
const newName = ref("")
const showRename = computed({
  get: () => !!renameTarget.value,
  set: (v) => { if (!v) renameTarget.value = null },
})

function startRename(item: MediaItem) {
  renameTarget.value = item
  newName.value = item.name
}

async function confirmRename() {
  if (!renameTarget.value || !newName.value.trim()) return
  try {
    await api.put(`/sites/${props.site}/media/rename`, {
      path: renameTarget.value.path,
      newName: newName.value.trim(),
    })
    toast.add({ title: "Renomeado.", color: "success" })
    renameTarget.value = null
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao renomear.", color: "error" })
  }
}

// ── Move ──────────────────────────────────────────
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
    await api.put(`/sites/${props.site}/media/move`, {
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

// ── Copy ──────────────────────────────────────────
async function copyItem(item: MediaItem) {
  try {
    await api.put(`/sites/${props.site}/media/copy`, { path: item.path })
    toast.add({ title: "Cópia criada.", color: "success" })
    await fetchItems()
  } catch {
    toast.add({ title: "Erro ao copiar.", color: "error" })
  }
}

// ── Helpers ──────────────────────────────────────────
function thumbUrl(item: MediaItem) {
  return `${apiBase}/sites/${props.site}/media/serve?path=${encodeURIComponent(item.path)}`
}

function fileIcon(item: MediaItem) {
  if (item.isVideo) return "i-heroicons-film"
  if (item.isAudio) return "i-heroicons-musical-note"
  return "i-heroicons-document"
}

function formatSize(bytes?: number) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="flex flex-col h-full"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <!-- Toolbar -->
    <div class="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-800 flex-shrink-0 flex-wrap">
      <!-- Breadcrumb -->
      <button
        class="text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
        :class="!currentPath ? 'text-white font-medium' : 'text-gray-400 hover:text-white'"
        @click="navigateTo('')"
      >
        raiz
      </button>
      <template v-for="crumb in breadcrumbs" :key="crumb.path">
        <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
        <button
          class="text-xs px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
          :class="crumb.path === currentPath ? 'text-white font-medium' : 'text-gray-400 hover:text-white'"
          @click="navigateTo(crumb.path)"
        >
          {{ crumb.label }}
        </button>
      </template>
      <div class="flex-1" />
      <input ref="fileInput" type="file" multiple class="hidden" accept="image/*,video/*,audio/*,.pdf" @change="handleFiles(($event.target as HTMLInputElement).files)" />
      <UButton icon="i-heroicons-arrow-up-tray" size="xs" variant="outline" color="neutral" :loading="uploading" @click="fileInput?.click()">
        Upload
      </UButton>
    </div>

    <!-- Upload progress bar -->
    <div v-if="uploading" class="flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 text-xs text-primary-400 flex-shrink-0">
      <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
      A carregar: {{ uploadingName }}
    </div>

    <!-- Drag overlay -->
    <div
      v-if="dragOver"
      class="absolute inset-0 z-10 flex items-center justify-center bg-primary-500/10 border-2 border-dashed border-primary-500 rounded-lg pointer-events-none"
    >
      <div class="text-center text-primary-400">
        <UIcon name="i-heroicons-arrow-up-tray" class="w-10 h-10 mx-auto mb-2" />
        <p class="text-sm font-medium">Largar ficheiros aqui</p>
      </div>
    </div>

    <!-- Grid -->
    <div class="flex-1 overflow-y-auto p-3 relative">
      <div v-if="pending" class="flex justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-500" />
      </div>

      <div v-else-if="!items.length && !currentPath" class="flex flex-col items-center justify-center py-12 text-gray-600">
        <UIcon name="i-heroicons-photo" class="w-10 h-10 mb-3 opacity-30" />
        <p class="text-sm">Sem ficheiros de media</p>
        <p class="text-xs mt-1">Arraste ficheiros ou use o botão Upload</p>
      </div>

      <div v-else class="grid grid-cols-3 gap-2">
        <!-- Up button -->
        <button
          v-if="currentPath"
          class="flex flex-col items-center gap-1 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors aspect-square justify-center"
          @click="navigateUp"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
          <span class="text-[10px]">..</span>
        </button>

        <!-- Folders -->
        <button
          v-for="item in items.filter(i => i.type === 'folder')"
          :key="item.path"
          class="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors aspect-square justify-center"
          @dblclick="navigateTo(item.path)"
          @click.single.stop
        >
          <UIcon name="i-heroicons-folder" class="w-9 h-9 text-yellow-500/70" />
          <span class="text-[10px] truncate w-full text-center leading-tight">{{ item.name }}</span>
        </button>

        <!-- Files -->
        <div
          v-for="item in items.filter(i => i.type === 'file')"
          :key="item.path"
          class="relative flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-800 transition-colors group aspect-square justify-center"
        >
          <!-- Preview -->
          <div class="w-full flex-1 rounded overflow-hidden bg-gray-800 flex items-center justify-center min-h-0">
            <img
              v-if="item.isImage"
              :src="thumbUrl(item)"
              :alt="item.name"
              class="w-full h-full object-cover"
            />
            <UIcon v-else :name="fileIcon(item)" class="w-8 h-8 text-gray-500" />
          </div>

          <span class="text-[10px] text-gray-400 truncate w-full text-center leading-tight">{{ item.name }}</span>
          <span class="text-[9px] text-gray-600">{{ formatSize(item.size) }}</span>

          <!-- Hover actions -->
          <div class="absolute top-1 right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <UButton
              icon="i-heroicons-pencil-square"
              size="xs"
              variant="solid"
              color="neutral"
              class="!p-1"
              title="Renomear"
              @click.stop="startRename(item)"
            />
            <UButton
              icon="i-heroicons-arrows-right-left"
              size="xs"
              variant="solid"
              color="neutral"
              class="!p-1"
              title="Mover"
              @click.stop="startMove(item)"
            />
            <UButton
              icon="i-heroicons-document-duplicate"
              size="xs"
              variant="solid"
              color="neutral"
              class="!p-1"
              title="Copiar"
              @click.stop="copyItem(item)"
            />
            <UButton
              icon="i-heroicons-trash"
              size="xs"
              variant="solid"
              color="error"
              class="!p-1"
              title="Eliminar"
              @click.stop="deleteItem(item)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Rename modal -->
    <UModal v-model:open="showRename" title="Renomear">
      <template #body>
        <UFormField label="Novo nome">
          <UInput v-model="newName" class="w-full" autofocus @keyup.enter="confirmRename" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="renameTarget = null">Cancelar</UButton>
          <UButton :disabled="!newName.trim()" @click="confirmRename">Renomear</UButton>
        </div>
      </template>
    </UModal>

    <!-- Move modal -->
    <UModal v-model:open="showMove" title="Mover para">
      <template #body>
        <div class="space-y-1">
          <UFormField label="Pasta de destino">
            <UInput v-model="moveDestination" class="w-full font-mono" placeholder="ex: about/images" @keyup.enter="confirmMove" />
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
  </div>
</template>
