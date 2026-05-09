<script setup lang="ts">
const route = useRoute()
const { user, logout } = useAuth()
const api   = useApi()
const toast = useToast()

const site = computed(() => route.params.site as string)

// ── Settings ─────────────────────────────────────────────
const { data: settingsData, refresh: refreshSettings } = await useAsyncData(
  `settings-${site.value}`,
  () => api.get<{ success: boolean; settings: any; versions: string[]; cmsConfig: any }>(`/sites/${site.value}/settings`)
)

const lastPublished    = computed(() => settingsData.value?.settings?.lastPublished ?? null)
const publishedFrom    = computed(() => settingsData.value?.settings?.publishedFrom ?? null)
const activeVersion    = computed(() => settingsData.value?.settings?.activeEditionVersion || "v1")
const previewUrl       = computed(() => settingsData.value?.cmsConfig?.previewUrl || "")

// All versions on disk, non-production for editing
const allVersions      = computed<string[]>(() => settingsData.value?.settings?.siteVersions || ["v1"])
const editableVersions = computed(() => allVersions.value.filter(v => v !== "production"))

// ── Version switcher ─────────────────────────────────────
const switchingVersion = ref(false)

async function switchVersion(v: string) {
  if (v === activeVersion.value || switchingVersion.value) return
  switchingVersion.value = true
  try {
    await api.put(`/sites/${site.value}/settings`, { activeEditionVersion: v })
    // refreshSettings updates activeVersion → the :key on PageTreeSidebar changes
    // → component remounts → fetchTree fires automatically with the new version
    await refreshSettings()
    // Also refresh any other useAsyncData on the current page (block editors, etc.)
    await refreshNuxtData()
    toast.add({ title: `A editar versão ${v}`, color: "info" })
  } catch {
    toast.add({ title: "Erro ao mudar versão.", color: "error" })
  } finally {
    switchingVersion.value = false
  }
}

// ── Create new version modal ──────────────────────────────
const showNewVersionModal = ref(false)
const newVersionName      = ref("")
const creatingVersion     = ref(false)

async function createVersion() {
  const name = newVersionName.value.trim()
  if (!name) return
  creatingVersion.value = true
  try {
    await api.post(`/sites/${site.value}/versions`, { name, from: activeVersion.value })
    toast.add({ title: `Versão "${name}" criada a partir de ${activeVersion.value}.`, color: "success" })
    showNewVersionModal.value = false
    newVersionName.value = ""
    await refreshSettings()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao criar versão.", color: "error" })
  } finally {
    creatingVersion.value = false
  }
}

// ── Publish ───────────────────────────────────────────────
const showPublishModal = ref(false)
const publishing       = ref(false)

async function publish() {
  publishing.value = true
  try {
    await api.post<{ success: boolean; publishedAt: string; from: string }>(`/sites/${site.value}/publish`, {})
    toast.add({ title: `Publicado com sucesso — versão ${activeVersion.value} → production`, color: "success" })
    showPublishModal.value = false
    await refreshSettings()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao publicar.", color: "error" })
  } finally {
    publishing.value = false
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ── Expose publish to CmsTopbar via inject ────────────────
provide("cmsPublish", {
  publishing:       readonly(publishing),
  activeVersion,
  openPublishModal: () => { showPublishModal.value = true },
})

// ── Expose role flag to any descendant (BlockEditor, etc.) ─
provide("cmsIsAdmin", computed(() => user.value?.role === "admin"))

// ── Nav ───────────────────────────────────────────────────
const navItems = computed(() => {
  const base  = `/${site.value}`
  const items = [
    { label: "Dashboard",     icon: "i-heroicons-home",                   to: base, exact: true },
    { label: "Estatísticas",  icon: "i-heroicons-chart-bar",              to: `${base}/stats` },
    { label: "Global",        icon: "i-heroicons-cog-6-tooth",            to: `${base}/global` },
    { label: "Configurações", icon: "i-heroicons-adjustments-horizontal", to: `${base}/settings` },
  ]
  if (user.value?.role === "admin")
    items.push({ label: "Usuários", icon: "i-heroicons-users", to: `${base}/users`, exact: false })
  return items
})

function isActive(item: { to: string; exact?: boolean }) {
  if (item.exact) return route.path === item.to
  return route.path.startsWith(item.to)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-950 text-gray-100">

    <!-- ═══ Sidebar ════════════════════════════════════════════ -->
    <aside class="w-56 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">

      <!-- Logo + site -->
      <div class="flex-shrink-0 border-b border-gray-800 px-4 py-3 space-y-2">
        <!-- Line 1: icon + brand -->
        <div class="flex items-center gap-2 mb-4">
          <div class="relative w-6 h-6 flex-shrink-0">
            <div class="absolute inset-0 rounded-lg bg-primary-500 opacity-20 blur-sm" />
            <div class="relative w-6 h-6 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
              <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2 L11.5 8.5 L18 10 L11.5 11.5 L10 18 L8.5 11.5 L2 10 L8.5 8.5 Z" fill="white" />
              </svg>
            </div>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-xs font-black tracking-[0.18em] uppercase text-white leading-none">Sirius</span>
            <span class="text-[8px] font-semibold tracking-[0.25em] uppercase text-primary-400/70 leading-none">CMS</span>
          </div>
        </div>
        <!-- Line 2: site name -->
        <div class="flex items-center gap-1.5 ml-1">
          <div class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <span class="text-[15px] font-mono text-gray-300 truncate leading-none">{{ site }}</span>
        </div>
      </div>

      <!-- Page tree -->
      <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <PageTreeSidebar :site="site" :key="`${site}-${activeVersion}`" />

        <div class="my-3 border-t border-gray-800" />

        <NuxtLink
          :to="`/${site}/media`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/media`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-photo" class="w-4 h-4 flex-shrink-0" />
          Media
        </NuxtLink>

        <div class="my-3 border-t border-gray-800" />

        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="isActive(item)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon :name="item.icon" class="w-4 h-4 flex-shrink-0" />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <slot />

      <!-- ── Footer ─────────────────────────────────────────── -->
      <div class="h-9 flex-shrink-0 flex items-center gap-3 px-4 border-t border-gray-800 bg-gray-900/60 text-gray-500">

        <!-- Version selector -->
        <span class="text-[9px] uppercase tracking-widest text-gray-600">Versão</span>
        <USelect
          :model-value="activeVersion"
          :items="editableVersions"
          size="xs"
          class="w-24"
          :loading="switchingVersion"
          :disabled="switchingVersion || editableVersions.length <= 1"
          @update:model-value="switchVersion"
        />
        <UButton
          v-if="user?.role === 'admin'"
          icon="i-heroicons-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          class="!p-1 -ml-1"
          title="Nova versão"
          @click="showNewVersionModal = true"
        />

        <div class="flex-1" />

        <!-- Last published -->
        <div v-if="lastPublished" class="flex items-center gap-1.5 text-[10px]">
          <UIcon name="i-heroicons-clock" class="w-3 h-3 opacity-50" />
          <span>{{ fmtDate(lastPublished) }}</span>
          <span v-if="publishedFrom" class="font-mono text-gray-700">({{ publishedFrom }})</span>
        </div>

      </div>
    </div>
  </div>

  <!-- ═══ New version modal ══════════════════════════════════ -->
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
        <UButton variant="ghost" color="neutral" @click="showNewVersionModal = false" :disabled="creatingVersion">
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

  <!-- ═══ Publish modal ══════════════════════════════════════ -->
  <UModal v-model:open="showPublishModal" title="Publicar site">
    <template #body>
      <div class="space-y-4">
        <!-- Flow diagram -->
        <div class="flex items-center gap-3 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div class="flex-1 text-center">
            <div class="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Edição</div>
            <div class="font-mono text-sm font-bold text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-lg px-3 py-2">
              {{ activeVersion }}
            </div>
          </div>
          <div class="flex flex-col items-center gap-1 text-green-500">
            <UIcon name="i-heroicons-arrow-right" class="w-5 h-5" />
          </div>
          <div class="flex-1 text-center">
            <div class="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Produção</div>
            <div class="font-mono text-sm font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              production
            </div>
          </div>
        </div>

        <p class="text-xs text-gray-500">
          Todo o conteúdo de
          <span class="font-mono text-white">{{ activeVersion }}</span>
          será copiado para
          <span class="font-mono text-white">production</span>.
          O conteúdo de produção anterior será substituído.
        </p>

        <div v-if="lastPublished" class="text-xs text-gray-600 pt-2 border-t border-gray-800 flex items-center gap-1.5">
          <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
          Última publicação: {{ fmtDate(lastPublished) }}
          <span v-if="publishedFrom" class="font-mono ml-0.5 text-gray-500">({{ publishedFrom }})</span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showPublishModal = false" :disabled="publishing">
          Cancelar
        </UButton>
        <UButton
          icon="i-heroicons-rocket-launch"
          color="success"
          :loading="publishing"
          @click="publish"
        >
          Publicar agora
        </UButton>
      </div>
    </template>
  </UModal>
</template>
