<script setup lang="ts">
const props = defineProps<{
  site:             string
  activeVersion:    string
  editableVersions: string[]
  switchingVersion: boolean
  lastPublished:    string | null
  publishedFrom:    string | null
  isAdmin:          boolean
}>()

const emit = defineEmits<{
  switchVersion:    [version: string]
  versionsUpdated:  []
}>()

const api   = useApi()
const toast = useToast()

// ── Create new version ────────────────────────────────────
const showNewVersionModal = ref(false)
const newVersionName      = ref("")
const creatingVersion     = ref(false)

async function createVersion() {
  const name = newVersionName.value.trim()
  if (!name) return
  creatingVersion.value = true
  try {
    await api.post(`/sites/${props.site}/versions`, { name, from: props.activeVersion })
    toast.add({ title: `Versão "${name}" criada a partir de ${props.activeVersion}.`, color: "success" })
    showNewVersionModal.value = false
    newVersionName.value = ""
    emit("versionsUpdated")
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar versão.", color: "error" })
  } finally {
    creatingVersion.value = false
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
</script>

<template>
  <!-- ── Footer bar ─────────────────────────────────────── -->
  <div class="h-9 flex-shrink-0 flex items-center gap-3 px-4 border-t border-gray-800 bg-gray-900/60 text-gray-500">

    <span class="text-[9px] uppercase tracking-widest text-gray-600">Versão</span>
    <USelect
      :model-value="activeVersion"
      :items="editableVersions"
      size="xs"
      class="w-24"
      :loading="switchingVersion"
      :disabled="switchingVersion || editableVersions.length <= 1"
      @update:model-value="emit('switchVersion', $event)"
    />
    <UButton
      v-if="isAdmin"
      icon="i-heroicons-plus"
      size="xs"
      color="neutral"
      variant="ghost"
      class="!p-1 -ml-1"
      title="Nova versão"
      @click="showNewVersionModal = true"
    />

    <div class="flex-1" />

    <div v-if="lastPublished" class="flex items-center gap-1.5 text-[10px]">
      <UIcon name="i-heroicons-clock" class="w-3 h-3 opacity-50" />
      <span>{{ fmtDate(lastPublished) }}</span>
      <span v-if="publishedFrom" class="font-mono text-gray-700">({{ publishedFrom }})</span>
    </div>

  </div>

  <!-- ── New version modal ──────────────────────────────── -->
  <UModal v-model:open="showNewVersionModal" title="Nova versão de conteúdo">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-gray-300">
          Será criada uma cópia da versão
          <span class="font-mono text-white bg-gray-800 px-1.5 py-0.5 rounded text-xs">{{ activeVersion }}</span>
          com o nome que indicar.
        </p>
        <UFormField label="Nome da nova versão">
          <UInput
            v-model="newVersionName"
            placeholder="ex: v2"
            class="w-full font-mono"
            autofocus
            @keyup.enter="createVersion"
          />
        </UFormField>
        <p class="text-xs text-gray-600">Use apenas letras minúsculas, números e hífens.</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" :disabled="creatingVersion" @click="showNewVersionModal = false">
          Cancelar
        </UButton>
        <UButton
          icon="i-heroicons-plus-circle"
          color="primary"
          :loading="creatingVersion"
          :disabled="!newVersionName.trim()"
          @click="createVersion"
        >
          Criar versão
        </UButton>
      </div>
    </template>
  </UModal>
</template>
