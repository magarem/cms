<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus"

definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()

const site = route.params.site as string
const slugParts = route.params.slug as string[]
const collectionPath = slugParts.join("/")
const collectionName = collectionPath.split("/").pop() || collectionPath

const { data, pending, refresh } = await useAsyncData(
  `collection-${site}-${collectionPath}`,
  () => api.get<{ success: boolean; items: any[] }>(`/sites/${site}/collection?path=${encodeURIComponent(collectionPath)}`)
)

const { data: treeData } = await useAsyncData(
  `tree-${site}`,
  () => api.get<{ tree: any[] }>(`/sites/${site}/tree`)
)

function findInTree(nodes: any[], slug: string): any | null {
  for (const node of nodes) {
    if (node.slug === slug) return node
    if (node.children?.length) {
      const hit = findInTree(node.children, slug)
      if (hit) return hit
    }
  }
  return null
}

const allItems = computed(() => data.value?.items || [])
const coverItem = computed(() => allItems.value.find((i: any) => i.isCover) ?? null)
const rawItems = computed(() => allItems.value.filter((i: any) => !i.isCover))

const localItems = ref<any[]>([])
watch(rawItems, (val) => { localItems.value = [...val] }, { immediate: true })

// ── Pagination ────────────────────────────────────────────────
const PAGE_SIZE = 20
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(localItems.value.length / PAGE_SIZE)))
watch(totalPages, (t) => { if (page.value > t) page.value = t })

// Writable slice so VueDraggable updates the correct segment of localItems
const pageItems = computed({
  get() {
    const start = (page.value - 1) * PAGE_SIZE
    return localItems.value.slice(start, start + PAGE_SIZE)
  },
  set(reordered: any[]) {
    const start = (page.value - 1) * PAGE_SIZE
    const next = [...localItems.value]
    next.splice(start, PAGE_SIZE, ...reordered)
    localItems.value = next
  },
})

// ── Order save ────────────────────────────────────────────────
const orderSaving = ref(false)
async function saveOrder() {
  orderSaving.value = true
  try {
    await api.put(`/sites/${site}/collection/order`, {
      path: collectionPath,
      order: localItems.value.map((i: any) => i.name),
    })
  } catch {
    toast.add({ title: "Erro ao salvar ordem.", color: "error" })
  } finally {
    orderSaving.value = false
  }
}

// ── Tree / title ──────────────────────────────────────────────
const treeNode = computed(() => findInTree(treeData.value?.tree || [], collectionPath))
const collectionTitle = computed(() => treeNode.value?.title || collectionName)

// ── Formatting helpers ────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-500/10 text-green-400 border border-green-500/20",
  draft:     "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  archived:  "bg-gray-500/10 text-gray-500 border border-gray-700",
}
function statusStyle(s: string | null) {
  return s ? (STATUS_STYLES[s] ?? "bg-gray-500/10 text-gray-400 border border-gray-700") : ""
}

// ── Create item ───────────────────────────────────────────────
const router = useRouter()

const showCreate = ref(false)
const newTitle = ref("")
const newSlug = ref("")
const creating = ref(false)

watch(newTitle, (val) => {
  newSlug.value = val
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
})

async function createItem() {
  if (!newSlug.value) return
  creating.value = true
  try {
    const res = await api.post<{ success: boolean; slug: string }>(`/sites/${site}/collection`, {
      collectionPath,
      slug: newSlug.value,
      title: newTitle.value || newSlug.value,
    })
    showCreate.value = false
    newTitle.value = ""
    newSlug.value = ""
    await router.push(`/${site}/pages/${res.slug}`)
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar.", color: "error" })
  } finally {
    creating.value = false
  }
}

// ── Delete item ───────────────────────────────────────────────
const deletingSlug = ref<string | null>(null)

async function deleteItem(itemSlug: string) {
  deletingSlug.value = itemSlug
  try {
    await api.del(`/sites/${site}/collection?path=${encodeURIComponent(itemSlug)}`)
    toast.add({ title: "Item eliminado.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao eliminar.", color: "error" })
  } finally {
    deletingSlug.value = null
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
      <UIcon name="i-heroicons-rectangle-stack" class="w-3.5 h-3.5 text-blue-400/70 flex-shrink-0" />
      <span class="text-white font-medium truncate">{{ collectionTitle }}</span>
      <UBadge color="neutral" variant="soft" size="xs" class="ml-1">{{ localItems.length }}</UBadge>
    </template>
    <template #actions>
      <NuxtLink :to="`/${site}/preview?path=${encodeURIComponent('/' + collectionPath)}`">
        <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral">Preview</UButton>
      </NuxtLink>
      <UButton icon="i-heroicons-plus" size="sm" @click="showCreate = true">Novo item</UButton>
    </template>
  </CmsTopbar>

  <!-- Body -->
  <div class="flex-1 overflow-auto">
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
    </div>

    <template v-else>
      <!-- Cover item -->
      <div v-if="coverItem" class="px-6 pt-5 pb-3">
        <NuxtLink
          :to="`/${site}/pages/${coverItem.slug}`"
          class="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 transition-colors group"
        >
          <UIcon name="i-heroicons-bookmark" class="w-4 h-4 text-amber-500/80 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm text-white font-medium truncate">{{ coverItem.title || 'Capa' }}</p>
              <span class="text-[10px] font-mono text-amber-600/60 bg-amber-500/10 px-1.5 py-0.5 rounded flex-shrink-0">_index</span>
            </div>
            <p class="text-xs text-gray-600 font-mono truncate">{{ coverItem.slug }}/_index.yml</p>
          </div>
          <UIcon name="i-heroicons-pencil-square" class="w-4 h-4 text-gray-600 group-hover:text-white transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
        </NuxtLink>
      </div>

      <!-- Datagrid -->
      <div class="px-6" :class="coverItem ? 'pb-6' : 'py-6'">

        <!-- Empty state -->
        <div
          v-if="!localItems.length"
          class="flex flex-col items-center justify-center py-20 gap-3 text-gray-600 border border-dashed border-gray-800 rounded-lg"
        >
          <UIcon name="i-heroicons-rectangle-stack" class="w-10 h-10 opacity-30" />
          <p class="text-sm">Sem entradas nesta coleção</p>
          <UButton size="sm" variant="outline" @click="showCreate = true">Criar primeiro item</UButton>
        </div>

        <template v-else>
          <!-- Table -->
          <div class="rounded-lg border border-gray-800 overflow-hidden">
            <!-- Header -->
            <div class="grid items-center bg-gray-900 border-b border-gray-800 text-[10px] uppercase tracking-widest text-gray-500 font-medium"
                 style="grid-template-columns: 36px 1fr 110px 120px 120px 90px 68px">
              <div />
              <div class="py-2.5 px-3">Título</div>
              <div class="py-2.5 px-3">Data</div>
              <div class="py-2.5 px-3">Criado</div>
              <div class="py-2.5 px-3">Modificado</div>
              <div class="py-2.5 px-3">Estado</div>
              <div />
            </div>

            <!-- Rows -->
            <VueDraggable
              v-model="pageItems"
              handle=".item-drag-handle"
              :animation="150"
              @end="saveOrder"
            >
              <div
                v-for="item in pageItems"
                :key="item.slug"
                class="grid items-center border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors group"
                style="grid-template-columns: 36px 1fr 110px 120px 120px 90px 68px"
              >
                <!-- Drag handle -->
                <div class="flex items-center justify-center h-full">
                  <div class="item-drag-handle cursor-grab active:cursor-grabbing text-gray-700 hover:text-gray-400 transition-colors p-1">
                    <UIcon name="i-heroicons-bars-2" class="w-3.5 h-3.5" />
                  </div>
                </div>

                <!-- Title + slug -->
                <div class="py-3 px-3 min-w-0">
                  <NuxtLink
                    :to="`/${site}/pages/${item.slug}`"
                    class="text-sm text-white font-medium truncate leading-snug hover:text-primary-400 transition-colors block"
                  >{{ item.title }}</NuxtLink>
                  <p class="text-[11px] text-gray-600 font-mono truncate mt-0.5">{{ item.name }}</p>
                </div>

                <!-- Content date -->
                <div class="py-3 px-3 text-xs text-gray-500 tabular-nums">
                  {{ fmtDate(item.date) }}
                </div>

                <!-- Created at -->
                <div class="py-3 px-3 text-xs text-gray-500 tabular-nums">
                  {{ fmtDate(item.createdAt) }}
                </div>

                <!-- Modified at -->
                <div class="py-3 px-3 text-xs text-gray-500 tabular-nums">
                  {{ fmtDate(item.updatedAt) }}
                </div>

                <!-- Status -->
                <div class="py-3 px-3">
                  <span
                    v-if="item.status"
                    class="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full capitalize"
                    :class="statusStyle(item.status)"
                  >{{ item.status }}</span>
                  <span v-else class="text-gray-700 text-xs">—</span>
                </div>

                <!-- Actions -->
                <div class="py-2 px-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <NuxtLink :to="`/${site}/pages/${item.slug}`">
                    <UButton icon="i-heroicons-pencil-square" size="xs" variant="ghost" color="neutral" />
                  </NuxtLink>
                  <UButton
                    icon="i-heroicons-trash"
                    size="xs"
                    variant="ghost"
                    color="error"
                    :loading="deletingSlug === item.slug"
                    @click="deleteItem(item.slug)"
                  />
                </div>
              </div>
            </VueDraggable>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 text-sm">
            <p class="text-gray-600 text-xs">
              {{ (page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(page * PAGE_SIZE, localItems.length) }}
              de {{ localItems.length }} itens
            </p>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-heroicons-chevron-left"
                size="xs"
                variant="outline"
                color="neutral"
                :disabled="page === 1"
                @click="page--"
              />
              <div class="flex items-center gap-1">
                <button
                  v-for="p in totalPages"
                  :key="p"
                  class="w-7 h-7 rounded text-xs transition-colors"
                  :class="p === page
                    ? 'bg-primary-500/20 text-primary-400 font-medium'
                    : 'text-gray-500 hover:text-white hover:bg-gray-800'"
                  @click="page = p"
                >
                  {{ p }}
                </button>
              </div>
              <UButton
                icon="i-heroicons-chevron-right"
                size="xs"
                variant="outline"
                color="neutral"
                :disabled="page === totalPages"
                @click="page++"
              />
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreate" title="Novo item">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Título">
          <UInput v-model="newTitle" placeholder="Título do item" autofocus class="w-full" @keyup.enter="createItem" />
        </UFormField>
        <UFormField label="Slug (URL)">
          <UInput v-model="newSlug" placeholder="slug-do-item" class="w-full font-mono" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showCreate = false">Cancelar</UButton>
        <UButton :loading="creating" :disabled="!newSlug" @click="createItem">Criar</UButton>
      </div>
    </template>
  </UModal>
</template>
