<script setup lang="ts">
const props = defineProps<{ site: string }>()
const api = useApi()
const toast = useToast()
const router = useRouter()

const tree = ref<any[]>([])
const pending = ref(false)

async function fetchTree() {
  if (!props.site) return
  pending.value = true
  try {
    const res = await api.get<{ success: boolean; tree: any[] }>(`/sites/${props.site}/tree`)
    tree.value = res.tree || []
  } catch {
    tree.value = []
  } finally {
    pending.value = false
  }
}

provide("refreshTree", fetchTree)

onMounted(fetchTree)
watch(() => props.site, fetchTree)

// ── Create modal ──────────────────────────────────────────────
type CreateType = "page" | "folder" | "collection"

const showCreate = ref(false)
const createType = ref<CreateType>("page")
const createPath = ref("")
const createTitle = ref("")
const creating = ref(false)

const CREATE_META: Record<CreateType, { label: string; icon: string; pathPlaceholder: string }> = {
  page:       { label: "Nova página",   icon: "i-heroicons-document-plus",  pathPlaceholder: "ex: sobre/equipa" },
  folder:     { label: "Nova pasta",    icon: "i-heroicons-folder-plus",    pathPlaceholder: "ex: projetos" },
  collection: { label: "Nova coleção",  icon: "i-heroicons-rectangle-stack", pathPlaceholder: "ex: servicos" },
}

function openCreate(type: CreateType) {
  createType.value = type
  createPath.value = ""
  createTitle.value = ""
  showCreate.value = true
}

async function submitCreate() {
  const cleanPath = createPath.value.trim().replace(/^\/+|\/+$/g, "")
  if (!cleanPath) return
  creating.value = true
  try {
    if (createType.value === "page") {
      await api.post(`/sites/${props.site}/page`, {
        path: cleanPath,
        title: createTitle.value || undefined,
      })
      toast.add({ title: "Nova página criada.", color: "success" })
      showCreate.value = false
      await fetchTree()
      router.push(`/${props.site}/pages/${cleanPath}`)
    } else if (createType.value === "folder") {
      await api.post(`/sites/${props.site}/tree/folder`, { path: cleanPath })
      toast.add({ title: "Nova pasta criada.", color: "success" })
      showCreate.value = false
      await fetchTree()
    } else {
      await api.post(`/sites/${props.site}/tree/collection`, {
        path: cleanPath,
        title: createTitle.value || undefined,
      })
      toast.add({ title: "Nova coleção criada.", color: "success" })
      showCreate.value = false
      await fetchTree()
      router.push(`/${props.site}/collections/${cleanPath}`)
    }
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar.", color: "error" })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800/50">
      <button
        v-for="type in (['page', 'folder', 'collection'] as const)"
        :key="type"
        :title="CREATE_META[type].label"
        class="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        @click="openCreate(type)"
      >
        <UIcon :name="CREATE_META[type].icon" class="w-[18px] h-[18px]" />
      </button>
      <button
        title="Atualizar"
        class="w-8 h-8 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors ml-auto"
        @click="fetchTree"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" :class="pending ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Tree -->
    <div v-if="pending && !tree.length" class="px-3 py-2">
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-600" />
    </div>
    <PageTreeSidebarNode
      v-for="node in tree"
      :key="node.slug"
      :node="node"
      :site="site"
      :depth="0"
    />
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreate" :title="CREATE_META[createType].label">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Caminho" required>
          <UInput
            v-model="createPath"
            :placeholder="CREATE_META[createType].pathPlaceholder"
            autofocus
            class="w-full font-mono"
            @keyup.enter="submitCreate"
          />
          <template #hint>
            <span class="text-gray-600 text-[10px]">Relativo à raiz, ex: <code>servicos/design</code></span>
          </template>
        </UFormField>
        <UFormField v-if="createType !== 'folder'" label="Título">
          <UInput
            v-model="createTitle"
            placeholder="Título (opcional)"
            class="w-full"
            @keyup.enter="submitCreate"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showCreate = false">Cancelar</UButton>
        <UButton
          :icon="CREATE_META[createType].icon"
          :loading="creating"
          :disabled="!createPath.trim()"
          @click="submitCreate"
        >
          Criar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
