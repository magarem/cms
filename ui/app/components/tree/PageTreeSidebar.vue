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

// ── Models for the create modal ───────────────────────────────
const { models, fetchModels, forTarget } = useModels(() => props.site)
onMounted(fetchModels)
watch(() => props.site, fetchModels)

const pageModels = forTarget("page")
const itemModels = forTarget("collection-item")

const NONE_VALUE = "__none__"
type ModelOption = { value: string; label: string }

function modelLabel(m: { label: string; source?: "global" | "site" }): string {
  return m.source === "site" ? `${m.label} · este site` : m.label
}
const pageModelOptions = computed<ModelOption[]>(() => [
  { value: NONE_VALUE, label: "Padrão (Página Normal)" },
  ...pageModels.value.map((m) => ({ value: m.name, label: modelLabel(m) })),
])
const itemModelOptions = computed<ModelOption[]>(() => [
  { value: NONE_VALUE, label: "Padrão (item simples)" },
  ...itemModels.value.map((m) => ({ value: m.name, label: modelLabel(m) })),
])

// ── Create modal ──────────────────────────────────────────────
type CreateType = "page" | "folder" | "collection"

const showCreate = ref(false)
const createType = ref<CreateType>("page")
const createPath = ref("")
const createTitle = ref("")
const createModel = ref<string>(NONE_VALUE)
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
  createModel.value = NONE_VALUE
  showCreate.value = true
}

async function submitCreate() {
  const cleanPath = createPath.value.trim().replace(/^\/+|\/+$/g, "")
  if (!cleanPath) return
  creating.value = true
  const modelArg = createModel.value && createModel.value !== NONE_VALUE
    ? createModel.value
    : undefined
  try {
    if (createType.value === "page") {
      await api.post(`/sites/${props.site}/page`, {
        path: cleanPath,
        title: createTitle.value || undefined,
        model: modelArg,
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
        itemModel: modelArg,
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
        <UFormField
          v-if="createType === 'page'"
          label="Modelo"
          hint="Estrutura inicial da página"
        >
          <USelect
            v-model="createModel"
            :items="pageModelOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-else-if="createType === 'collection'"
          label="Modelo dos itens"
          hint="Será usado por padrão ao criar novos itens nesta coleção"
        >
          <USelect
            v-model="createModel"
            :items="itemModelOptions"
            value-key="value"
            class="w-full"
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
