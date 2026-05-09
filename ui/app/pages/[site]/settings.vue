<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route  = useRoute()
const api    = useApi()
const toast  = useToast()
const site   = route.params.site as string

const { data, refresh } = await useAsyncData(`settings-page-${site}`, () =>
  api.get<{ success: boolean; settings: any; cmsConfig: any }>(`/sites/${site}/settings`),
  { server: false }
)

const previewUrl           = ref("")
const googleAnalyticsId    = ref("")
const siteVersions         = ref<string[]>(["v1"])
const activeEditionVersion = ref("v1")
const defaultSiteVersion   = ref("v1")

const editableVersions = computed(() => siteVersions.value.filter(v => v !== "production"))

watch(data, (val) => {
  if (!val) return
  previewUrl.value           = val.cmsConfig?.previewUrl || ""
  googleAnalyticsId.value    = val.cmsConfig?.googleAnalyticsId || ""
  siteVersions.value         = val.settings?.siteVersions || ["v1"]
  activeEditionVersion.value = val.settings?.activeEditionVersion || "v1"
  defaultSiteVersion.value   = val.settings?.defaultSiteVersion || "v1"
}, { immediate: true })

// ── Save settings ─────────────────────────────────────────
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await api.put(`/sites/${site}/settings`, {
      activeEditionVersion: activeEditionVersion.value,
      defaultSiteVersion: defaultSiteVersion.value,
      cmsConfig: { previewUrl: previewUrl.value, googleAnalyticsId: googleAnalyticsId.value },
    })
    toast.add({ title: "Configurações guardadas.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}

// ── Create version ────────────────────────────────────────
const showVersionModal = ref(false)
const newVersionName   = ref("")
const newVersionFrom   = ref("")
const creatingVersion  = ref(false)

function openNewVersionModal() {
  newVersionFrom.value = activeEditionVersion.value
  newVersionName.value = ""
  showVersionModal.value = true
}

async function createVersion() {
  const name = newVersionName.value.trim()
  if (!name) return
  creatingVersion.value = true
  try {
    await api.post(`/sites/${site}/versions`, { name, from: newVersionFrom.value || undefined })
    toast.add({ title: `Versão "${name}" criada.`, color: "success" })
    showVersionModal.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar versão.", color: "error" })
  } finally {
    creatingVersion.value = false
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
      <span class="text-white font-medium">Configurações</span>
    </template>
    <template #actions>
      <UButton :loading="saving" icon="i-heroicons-check" size="sm" @click="save">Save</UButton>
    </template>
  </CmsTopbar>

  <!-- Content -->
  <div class="flex-1 overflow-auto p-6">
    <div class="max-w-xl space-y-5">

      <!-- Versions card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-white">Versões de conteúdo</span>
            <UButton
              icon="i-heroicons-plus"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="openNewVersionModal"
            >
              Nova versão
            </UButton>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Versions on disk -->
          <div class="flex flex-wrap gap-2">
            <div
              v-for="v in siteVersions"
              :key="v"
              class="flex items-center gap-1.5 text-xs font-mono bg-gray-800 border rounded-lg px-2.5 py-1.5"
              :class="v === activeEditionVersion
                ? 'border-primary-500/50 text-primary-400'
                : v === 'production'
                ? 'border-green-500/30 text-green-400'
                : 'border-gray-700 text-gray-400'"
            >
              <span
                class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                :class="v === activeEditionVersion ? 'bg-primary-400' : v === 'production' ? 'bg-green-400' : 'bg-gray-600'"
              />
              {{ v }}
              <span v-if="v === activeEditionVersion" class="text-[9px] text-gray-500 uppercase tracking-wider ml-0.5">edição</span>
              <span v-if="v === 'production'" class="text-[9px] text-gray-500 uppercase tracking-wider ml-0.5">live</span>
            </div>
          </div>

          <div class="border-t border-gray-800 pt-4 space-y-4">
            <UFormField label="Versão de edição (CMS)">
              <USelect
                v-model="activeEditionVersion"
                :items="editableVersions"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Versão padrão do site (produção)">
              <USelect
                v-model="defaultSiteVersion"
                :items="siteVersions"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <!-- Preview URL card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <span class="text-sm font-semibold text-white">Preview</span>
        </template>
        <UFormField label="URL do site (para preview)">
          <UInput
            v-model="previewUrl"
            placeholder="http://localhost:3000"
            class="w-full"
            icon="i-heroicons-globe-alt"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          URL onde o site corre localmente. Usado no painel de preview em tempo real.
        </p>
      </UCard>

      <!-- Google Analytics card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" fill="#F9AB00"/>
              <path d="M8.5 17V10M12 17V7M15.5 17V13" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="text-sm font-semibold text-white">Google Analytics</span>
            <UBadge v-if="googleAnalyticsId" color="success" variant="subtle" size="xs">Activo</UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="xs">Inactivo</UBadge>
          </div>
        </template>
        <UFormField label="Measurement ID (GA4)">
          <UInput
            v-model="googleAnalyticsId"
            placeholder="G-XXXXXXXXXX"
            class="w-full font-mono"
            icon="i-heroicons-chart-bar"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          O ID de medição encontra-se em Google Analytics → Admin → Fluxos de dados.
          Deixe vazio para desativar o tracking.
        </p>
      </UCard>

    </div>
  </div>

  <!-- Create version modal -->
  <UModal v-model:open="showVersionModal" title="Nova versão de conteúdo">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Nome da nova versão">
          <UInput
            v-model="newVersionName"
            placeholder="ex: v2"
            class="w-full font-mono"
            autofocus
            @keyup.enter="createVersion"
          />
        </UFormField>
        <UFormField label="Copiar a partir de">
          <USelect
            v-model="newVersionFrom"
            :items="siteVersions"
            class="w-full"
          />
        </UFormField>
        <p class="text-xs text-gray-600">Use apenas letras minúsculas, números e hífens.</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showVersionModal = false" :disabled="creatingVersion">
          Cancelar
        </UButton>
        <UButton
          icon="i-heroicons-plus-circle"
          color="primary"
          :loading="creatingVersion"
          :disabled="!newVersionName.trim()"
          @click="createVersion"
        >
          Criar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
