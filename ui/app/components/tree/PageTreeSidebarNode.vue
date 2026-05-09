<script setup lang="ts">
import { ref, computed, inject } from "vue"
import { useRoute } from "vue-router"

interface TreeNode {
  title: string
  slug: string
  type: "page" | "collection" | "folder"
  children?: TreeNode[]
}

const props = defineProps<{ node: TreeNode; site: string; depth: number }>()
const route = useRoute()
const api = useApi()
const toast = useToast()
const refreshTree = inject<() => Promise<void> | void>("refreshTree", async () => {})

const isCollection = computed(() => props.node.type === "collection")
const hasChildren = computed(() => props.node.type !== "collection" && !!props.node.children?.length)
const isExpandable = computed(() => hasChildren.value || props.node.type === "folder")

const expanded = ref(props.depth === 0)

function toggleExpand() {
  expanded.value = !expanded.value
}

// ── Active state ──────────────────────────────────────────────
const isActive = computed(() => {
  if (props.node.type === "page") return route.path === `/${props.site}/pages/${props.node.slug}`
  if (props.node.type === "collection") return route.path.startsWith(`/${props.site}/collections/${props.node.slug}`)
  return false
})

const linkTo = computed(() => {
  if (props.node.type === "page") return `/${props.site}/pages/${props.node.slug}`
  if (props.node.type === "collection") return `/${props.site}/collections/${props.node.slug}`
  return null
})

const nodeIcon = computed(() => {
  if (props.node.type === "collection") return "i-heroicons-rectangle-stack"
  if (props.node.type === "page") return hasChildren.value ? "i-heroicons-folder-open" : "i-heroicons-document-text"
  return "i-heroicons-folder"
})

// ── Drag & Drop Logic ─────────────────────────────────────────
const dropPosition = ref<"before" | "after" | "inside" | null>(null)

function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData("application/json", JSON.stringify({ 
    slug: props.node.slug, 
    type: props.node.type,
    title: props.node.title 
  }))
  event.dataTransfer.effectAllowed = "move"
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (!event.dataTransfer) return
  event.dataTransfer.dropEffect = "move"

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const y = event.clientY - rect.top

  if (props.node.type === "page") {
    // Pages cannot have items dropped inside them, only before/after for reordering
    dropPosition.value = y < rect.height / 2 ? "before" : "after"
  } else {
    // Folders & Collections allow inside, before, and after
    if (y < rect.height * 0.25) dropPosition.value = "before"
    else if (y > rect.height * 0.75) dropPosition.value = "after"
    else dropPosition.value = "inside"
  }
}

function onDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement
  const relatedTarget = event.relatedTarget as Node | null
  
  // Only clear the drop position if we actually left the row container
  if (!currentTarget.contains(relatedTarget)) {
    dropPosition.value = null
  }
}

// ── Drop Confirmation Modal ───────────────────────────────────
const showDropConfirm = ref(false)
const dropConfirming = ref(false)
const pendingDrop = ref<{ source: string, sourceTitle: string, destination: string, destTitle: string, position: "before"|"after"|"inside" } | null>(null)

function onDrop(event: DragEvent) {
  event.preventDefault()
  
  const position = dropPosition.value
  dropPosition.value = null

  const dataStr = event.dataTransfer?.getData("application/json")
  if (!dataStr || !position) return

  const data = JSON.parse(dataStr)
  
  // Prevent dropping into itself or into its own children
  if (data.slug === props.node.slug || props.node.slug.startsWith(`${data.slug}/`)) {
    return
  }

  pendingDrop.value = {
    source: data.slug,
    sourceTitle: data.title,
    destination: props.node.slug,
    destTitle: props.node.title,
    position: position
  }
  showDropConfirm.value = true
}

function parentOf(slug: string): string {
  const parts = slug.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

async function submitDropConfirm() {
  if (!pendingDrop.value) return
  dropConfirming.value = true

  try {
    const { source, destination, position } = pendingDrop.value
    const destFolder = position === 'inside' ? destination : parentOf(destination)

    await api.post(`/sites/${props.site}/tree/move`, {
      path: source,
      destination: destFolder || '/',
      position,
      ...(position !== 'inside' ? { referenceNode: destination } : {}),
    })

    toast.add({ title: "Movido com sucesso.", color: "success" })
    showDropConfirm.value = false

    if (position === 'inside') expanded.value = true
    await refreshTree()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao mover item.", color: "error" })
  } finally {
    dropConfirming.value = false
  }
}

// ── Context menu ──────────────────────────────────────────────
const menuOpen = ref(false)

// Rename modal
const showRename = ref(false)
const renaming = ref(false)
const newName = ref("")

function openRename() {
  newName.value = props.node.slug.split("/").pop() || ""
  showRename.value = true
}

async function submitRename() {
  const name = newName.value.trim()
  if (!name) return
  renaming.value = true
  try {
    await api.post(`/sites/${props.site}/tree/rename`, {
      path: props.node.slug,
      newName: name,
    })
    toast.add({ title: "Renomeado.", color: "success" })
    showRename.value = false
    await refreshTree()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao renomear.", color: "error" })
  } finally {
    renaming.value = false
  }
}

// Copy modal
const showCopy = ref(false)
const copying = ref(false)
const copyDest = ref("")

function openCopy() {
  const parts = props.node.slug.split("/")
  copyDest.value = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
  showCopy.value = true
}

async function submitCopy() {
  copying.value = true
  try {
    await api.post(`/sites/${props.site}/tree/copy`, {
      path: props.node.slug,
      destination: copyDest.value.trim() || "/",
    })
    toast.add({ title: "Copiado.", color: "success" })
    showCopy.value = false
    await refreshTree()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao copiar.", color: "error" })
  } finally {
    copying.value = false
  }
}

// Move modal (Context Menu)
const showMove = ref(false)
const moving = ref(false)
const moveDest = ref("")

function openMove() {
  const parts = props.node.slug.split("/")
  moveDest.value = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
  showMove.value = true
}

async function submitMove() {
  moving.value = true
  try {
    await api.post(`/sites/${props.site}/tree/move`, {
      path: props.node.slug,
      destination: moveDest.value.trim() || "/",
    })
    toast.add({ title: "Movido.", color: "success" })
    showMove.value = false
    await refreshTree()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao mover.", color: "error" })
  } finally {
    moving.value = false
  }
}

// Delete
const showDelete = ref(false)
const deleting = ref(false)

async function submitDelete() {
  deleting.value = true
  try {
    await api.del(`/sites/${props.site}/tree?path=${encodeURIComponent(props.node.slug)}`)
    toast.add({ title: "Eliminado.", color: "success" })
    showDelete.value = false
    await refreshTree()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao eliminar.", color: "error" })
  } finally {
    deleting.value = false
  }
}

const menuItems = computed(() => [[
  { label: "Renomear",       icon: "i-heroicons-pencil",              onSelect: openRename },
  { label: "Copiar para...", icon: "i-heroicons-document-duplicate",  onSelect: openCopy },
  { label: "Mover para...",  icon: "i-heroicons-arrows-right-left",   onSelect: openMove },
], [
  { label: "Eliminar", icon: "i-heroicons-trash", color: "error" as const, onSelect: () => { showDelete.value = true } },
]])
</script>

<template>
  <div>
    <!-- Node row with Drag & Drop events attached to the ROW, but draggable attached to ICON -->
    <div
      class="relative flex items-center group rounded-md transition-colors cursor-default select-none"
      :style="{ paddingLeft: `${depth * 16}px` }"
      :class="[
        isActive ? 'bg-primary-500/10' : 'hover:bg-gray-800/60',
        dropPosition === 'inside' ? 'bg-primary-500/20 ring-1 ring-primary-500/50' : ''
      ]"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @contextmenu.prevent="menuOpen = true"
    >
      <!-- Drop indicators for ordering -->
      <div v-if="dropPosition === 'before'" class="absolute top-0 left-0 right-0 h-0.5 bg-primary-500 z-10 pointer-events-none" />
      <div v-if="dropPosition === 'after'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 z-10 pointer-events-none" />

      <!-- Expand toggle -->
      <button
        v-if="isExpandable"
        class="w-5 h-7 flex items-center justify-center text-gray-600 hover:text-gray-300 flex-shrink-0"
        @click="toggleExpand"
      >
        <UIcon
          :name="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-4 h-4 pointer-events-none"
        />
      </button>
      <div v-else class="w-5 flex-shrink-0" />

      <!-- File icon: THIS IS THE DRAG HANDLE NOW -->
      <div 
        draggable="true" 
        @dragstart="onDragStart"
        class="cursor-grab active:cursor-grabbing flex items-center justify-center w-[18px] h-[18px] ml-1 flex-shrink-0 hover:scale-110 transition-transform"
        title="Arrastar para mover"
      >
        <UIcon
          :name="nodeIcon"
          class="w-full h-full pointer-events-none"
          :class="isActive ? 'text-primary-400' : node.type === 'collection' ? 'text-blue-400/80' : node.type === 'folder' ? 'text-yellow-500/80' : 'text-gray-400 opacity-70'"
        />
      </div>

      <!-- Title: link for pages/collections -->
      <NuxtLink
        v-if="linkTo"
        :to="linkTo"
        draggable="false"
        class="flex-1 min-w-0 py-1.5 text-[15px] truncate ml-2"
        :class="isActive ? 'text-primary-400' : 'text-gray-300 hover:text-white'"
      >
        {{ node.title }}
      </NuxtLink>

      <!-- Title: button for plain folders -->
      <button
        v-else
        class="flex-1 min-w-0 py-1.5 text-[15px] truncate text-gray-300 hover:text-white text-left ml-2"
        @click="toggleExpand"
      >
        {{ node.title }}
      </button>

      <!-- Context menu trigger -->
      <UDropdownMenu v-model:open="menuOpen" :items="menuItems" @click.stop>
        <button
          class="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-1"
          @click.prevent.stop="menuOpen = true"
        >
          <UIcon name="i-heroicons-ellipsis-vertical" class="w-[18px] h-[18px]" />
        </button>
      </UDropdownMenu>
    </div>

    <!-- Regular children (pages / nested folders) -->
    <div v-if="(hasChildren || node.type === 'folder') && expanded">
      <PageTreeSidebarNode
        v-for="child in node.children"
        :key="child.slug"
        :node="child"
        :site="site"
        :depth="depth + 1"
      />
    </div>
  </div>

  <!-- Drag & Drop Confirmation Modal -->
  <UModal v-model:open="showDropConfirm" title="Confirmar Movimentação">
    <template #body>
      <p v-if="pendingDrop" class="text-sm text-gray-300 space-y-2">
        <span class="block">
          Desejas mover <span class="font-bold text-white">{{ pendingDrop.sourceTitle }}</span>
        </span>
        <span class="block border-l-2 border-primary-500 pl-2 mt-2">
          <span v-if="pendingDrop.position === 'inside'">para dentro de</span>
          <span v-else-if="pendingDrop.position === 'before'">para antes de</span>
          <span v-else-if="pendingDrop.position === 'after'">para depois de</span>
          <span class="font-bold text-white ml-1">{{ pendingDrop.destTitle }}</span>?
        </span>
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDropConfirm = false">Cancelar</UButton>
        <UButton :loading="dropConfirming" icon="i-heroicons-arrows-right-left" @click="submitDropConfirm">Mover Arquivo</UButton>
      </div>
    </template>
  </UModal>

  <!-- Rename modal -->
  <UModal v-model:open="showRename" title="Renomear pasta / ficheiro">
    <template #body>
      <UFormField label="Nome da pasta (URL slug)" required>
        <UInput v-model="newName" autofocus class="w-full font-mono" @keyup.enter="submitRename" />
        <template #hint>
          <span class="text-gray-500 text-[11px]">Altera apenas o nome físico da pasta no disco. O título em <code>_index.yml</code> não é afetado.</span>
        </template>
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showRename = false">Cancelar</UButton>
        <UButton :loading="renaming" :disabled="!newName.trim()" @click="submitRename">Renomear</UButton>
      </div>
    </template>
  </UModal>

  <!-- Copy modal -->
  <UModal v-model:open="showCopy" title="Copiar para...">
    <template #body>
      <UFormField label="Pasta de destino">
        <UInput
          v-model="copyDest"
          placeholder="Deixar vazio para raiz"
          class="w-full font-mono"
          autofocus
          @keyup.enter="submitCopy"
        />
        <template #hint>
          <span class="text-gray-600 text-[10px]">Caminho relativo, ex: <code>servicos</code></span>
        </template>
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showCopy = false">Cancelar</UButton>
        <UButton icon="i-heroicons-document-duplicate" :loading="copying" @click="submitCopy">Copiar</UButton>
      </div>
    </template>
  </UModal>

  <!-- Move modal (Context Menu) -->
  <UModal v-model:open="showMove" title="Mover para...">
    <template #body>
      <UFormField label="Pasta de destino">
        <UInput
          v-model="moveDest"
          placeholder="Deixar vazio para raiz"
          class="w-full font-mono"
          autofocus
          @keyup.enter="submitMove"
        />
        <template #hint>
          <span class="text-gray-600 text-[10px]">Caminho relativo, ex: <code>servicos</code></span>
        </template>
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showMove = false">Cancelar</UButton>
        <UButton :loading="moving" @click="submitMove">Mover</UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation modal -->
  <UModal v-model:open="showDelete" title="Eliminar">
    <template #body>
      <p class="text-sm text-gray-300">
        Tens a certeza que queres eliminar <span class="font-mono text-white">{{ node.slug }}</span>?
        <br>
        <span class="text-gray-500 text-xs">Esta ação é irreversível e elimina todos os conteúdos dentro desta pasta.</span>
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDelete = false">Cancelar</UButton>
        <UButton color="error" :loading="deleting" icon="i-heroicons-trash" @click="submitDelete">Eliminar</UButton>
      </div>
    </template>
  </UModal>
</template>