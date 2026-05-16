<script setup lang="ts">
import type { PageModel, ModelTarget } from "~/composables/useModels"

definePageMeta({ layout: "cms" })

const route = useRoute()
const toast = useToast()
const site = route.params.site as string

const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === "admin")

const { models, pending, fetchModels, saveModel, deleteModel } = useModels(() => site)
onMounted(fetchModels)

const TARGET_LABELS: Record<ModelTarget, string> = {
  page: "Página",
  "collection-item": "Item de coleção",
  any: "Qualquer",
}
const TARGET_COLORS: Record<ModelTarget, "info" | "warning" | "neutral"> = {
  page: "info",
  "collection-item": "warning",
  any: "neutral",
}
const targetOptions = [
  { value: "any" as ModelTarget, label: TARGET_LABELS.any },
  { value: "page" as ModelTarget, label: TARGET_LABELS.page },
  { value: "collection-item" as ModelTarget, label: TARGET_LABELS["collection-item"] },
]

// ── Shared form state (create + edit) ─────────────────────────
const formName        = ref("")
const formLabel       = ref("")
const formDescription = ref("")
const formTarget      = ref<ModelTarget>("any")
const formSaving      = ref(false)

function autoSlug(val: string) {
  return val
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ── Create modal ─────────────────────────────────────────────
const showCreate = ref(false)

watch(formLabel, (val) => {
  // Auto-fill slug only when creating (formName untouched)
  if (showCreate.value && !formName.value) formName.value = autoSlug(val)
})

function openCreate() {
  formName.value = ""
  formLabel.value = ""
  formDescription.value = ""
  formTarget.value = "any"
  showCreate.value = true
}

async function submitCreate() {
  if (!formName.value.trim()) return
  formSaving.value = true
  try {
    await saveModel({
      name: formName.value.trim(),
      label: formLabel.value.trim() || formName.value.trim(),
      description: formDescription.value.trim(),
      target: formTarget.value,
      blocks: [],
    })
    toast.add({ title: "Modelo criado.", color: "success", ui: { progress: "hidden" } })
    showCreate.value = false
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar.", color: "error", ui: { progress: "hidden" } })
  } finally {
    formSaving.value = false
  }
}

// ── Delete confirm ───────────────────────────────────────────
const showDelete = ref(false)
const deleting   = ref<PageModel | null>(null)
const removing   = ref(false)

function openDelete(m: PageModel) {
  deleting.value  = m
  showDelete.value = true
}

async function submitDelete() {
  if (!deleting.value) return
  removing.value = true
  try {
    await deleteModel(deleting.value.name)
    toast.add({ title: "Modelo eliminado.", color: "success", ui: { progress: "hidden" } })
    showDelete.value = false
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao eliminar.", color: "error", ui: { progress: "hidden" } })
  } finally {
    removing.value = false
  }
}

function fieldCount(m: PageModel): number {
  return Array.isArray(m.fields) ? m.fields.length : 0
}
function blockCount(m: PageModel): number {
  return Array.isArray(m.blocks) ? m.blocks.length : (Array.isArray(m.template?.blocks) ? m.template.blocks.length : 0)
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Modelos</span>
      <UBadge color="neutral" variant="soft" size="xs" class="ml-1">{{ models.length }}</UBadge>
    </template>
    <template #actions>
      <UButton icon="i-heroicons-plus" size="sm" @click="openCreate">Novo</UButton>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">
    <div class="max-w-4xl">

      <div v-if="pending && !models.length" class="text-center text-gray-600 py-16 text-sm">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin inline-block mr-2" />
        A carregar...
      </div>

      <div v-else-if="!models.length" class="text-center text-gray-600 py-20 border border-dashed border-gray-800 rounded-xl">
        <UIcon name="i-heroicons-rectangle-stack" class="w-10 h-10 mx-auto opacity-30 mb-3" />
        <p class="text-sm mb-3">Sem modelos definidos.</p>
        <UButton size="sm" variant="outline" @click="openCreate">Criar primeiro modelo</UButton>
      </div>

      <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Campos</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Blocos</th>
              <th class="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in models"
              :key="m.name"
              class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors group"
            >
              <!-- Name + slug + description -->
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-white">{{ m.label }}</span>
                  <span class="text-[11px] font-mono text-gray-600">{{ m.name }}</span>
                  <span v-if="m.description" class="text-xs text-gray-500 mt-0.5">{{ m.description }}</span>
                </div>
              </td>

              <!-- Target + source badges -->
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1.5">
                  <UBadge :color="TARGET_COLORS[m.target]" variant="subtle" size="xs">
                    {{ TARGET_LABELS[m.target] }}
                  </UBadge>
                  <UBadge
                    v-if="m.source === 'global'"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    title="Modelo global (cms/models)"
                  >
                    Global
                  </UBadge>
                </div>
              </td>

              <!-- Field count -->
              <td class="px-4 py-3 text-gray-400 tabular-nums text-center">
                {{ fieldCount(m) || '—' }}
              </td>

              <!-- Block count -->
              <td class="px-4 py-3 text-gray-400 tabular-nums text-center">
                {{ blockCount(m) || '—' }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <NuxtLink :to="`/${site}/models/${m.name}`">
                    <UButton
                      icon="i-heroicons-pencil-square"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      title="Editar conteúdo"
                    />
                  </NuxtLink>
                  <UButton
                    v-if="isAdmin && m.source !== 'global'"
                    icon="i-heroicons-trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    title="Eliminar"
                    @click="openDelete(m)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-xs text-gray-700 mt-4">
        Modelos marcados como <strong class="text-gray-500">Global</strong> vêm de
        <code class="font-mono">cms/models/</code> e são partilhados por todos os sites.
        Modelos locais ficam em
        <code class="font-mono">storage/{{ site }}/_models/</code>.
      </p>
    </div>
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreate" title="Novo modelo">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Rótulo" required>
          <UInput
            v-model="formLabel"
            placeholder="ex: Artigo de Blog"
            autofocus
            class="w-full"
            @keyup.enter="submitCreate"
          />
        </UFormField>
        <UFormField label="Nome (slug)" required hint="Identificador único, sem espaços">
          <UInput
            v-model="formName"
            placeholder="ex: artigo-blog"
            class="w-full font-mono"
            @keyup.enter="submitCreate"
          />
        </UFormField>
        <UFormField label="Descrição">
          <UInput
            v-model="formDescription"
            placeholder="Para que serve este modelo?"
            class="w-full"
            @keyup.enter="submitCreate"
          />
        </UFormField>
        <UFormField label="Tipo" required>
          <USelect
            v-model="formTarget"
            :items="targetOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <p class="text-xs text-gray-600">
          O modelo será guardado em
          <code class="font-mono">storage/{{ site }}/_models/</code>.
          Os campos e blocos podem ser editados diretamente no ficheiro YAML.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showCreate = false">Cancelar</UButton>
        <UButton
          icon="i-heroicons-plus"
          :loading="formSaving"
          :disabled="!formName.trim()"
          @click="submitCreate"
        >
          Criar
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete confirm -->
  <UModal v-model:open="showDelete" title="Eliminar modelo">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar o modelo
        <span class="font-mono text-white bg-gray-800 px-1.5 py-0.5 rounded text-xs">{{ deleting?.name }}</span>?
        Páginas já criadas a partir deste modelo não serão afetadas.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDelete = false">Cancelar</UButton>
        <UButton
          icon="i-heroicons-trash"
          color="error"
          :loading="removing"
          @click="submitDelete"
        >
          Eliminar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
