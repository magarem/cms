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

// ── Create new version (handled by CmsFooter, layout refreshes on event) ──

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
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

// ── Expose publish to CmsTopbar via inject ────────────────
provide("cmsPublish", {
  publishing:       readonly(publishing),
  activeVersion,
  siteUrl:          previewUrl,
  openPublishModal: () => { showPublishModal.value = true },
})

// ── Expose role flag to any descendant (BlockEditor, etc.) ─
provide("cmsIsAdmin", computed(() => user.value?.role === "admin"))

const sidebarOpen = ref(true)

// ── Nav ───────────────────────────────────────────────────
const navItems = computed(() => {
  const base  = `/${site.value}`
  return [
    { label: "Dashboard",     icon: "i-heroicons-home",                    to: base,               exact: true },
    { label: "Global",        icon: "i-heroicons-cog-6-tooth",             to: `${base}/global` },
    { label: "Configurações", icon: "i-heroicons-adjustments-horizontal",  to: `${base}/settings` },
    { label: "Estatísticas",  icon: "i-heroicons-chart-bar",               to: `${base}/stats` },
    { label: "Modelos",       icon: "i-heroicons-rectangle-group",         to: `${base}/models` },
    { label: "Newsletter",    icon: "i-heroicons-envelope",                to: `${base}/newsletter` },
    { label: "Inscrições",    icon: "i-heroicons-clipboard-document-list", to: `${base}/inscricoes` },
    { label: "Backups",       icon: "i-heroicons-archive-box",             to: `${base}/backups` },
  ]
})

function isActive(item: { to: string; exact?: boolean }) {
  if (item.exact) return route.path === item.to
  return route.path.startsWith(item.to)
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
  <div class="flex flex-1 overflow-hidden min-h-0">

    <!-- ═══ Sidebar ════════════════════════════════════════════ -->
    <aside
      :class="sidebarOpen ? 'w-56' : 'w-10'"
      class="flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900 overflow-hidden transition-[width] duration-200"
    >

      <!-- Collapsed: just the open button centered -->
      <div v-if="!sidebarOpen" class="flex-shrink-0 border-b border-gray-800 flex items-center justify-center py-3">
        <button
          class="text-gray-500 hover:text-white transition-colors"
          title="Abrir menu"
          @click="sidebarOpen = true"
        >
          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        </button>
      </div>

      <!-- Open: full logo + site + close button -->
      <div v-else class="flex-shrink-0 border-b border-gray-800 px-4 py-3 space-y-2">
        <div class="flex items-center gap-2 mb-4">
          <div class="relative w-6 h-6 flex-shrink-0">
            <div class="absolute inset-0 rounded-lg bg-primary-500 opacity-20 blur-sm" />
            <div class="relative w-6 h-6 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
              <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2 L11.5 8.5 L18 10 L11.5 11.5 L10 18 L8.5 11.5 L2 10 L8.5 8.5 Z" fill="white" />
              </svg>
            </div>
          </div>
          <div class="flex items-baseline gap-1.5 flex-1 min-w-0">
            <span class="text-xs font-black tracking-[0.18em] uppercase text-white leading-none">Sirius</span>
            <span class="text-[8px] font-semibold tracking-[0.25em] uppercase text-primary-400/70 leading-none">CMS</span>
          </div>
          <button
            class="text-gray-500 hover:text-white transition-colors flex-shrink-0"
            title="Fechar menu"
            @click="sidebarOpen = false"
          >
            <UIcon name="i-heroicons-chevron-left" class="w-4 h-4" />
          </button>
        </div>
        <div class="flex items-center gap-1.5 ml-1">
          <div class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          <span class="text-[15px] font-mono text-gray-300 truncate leading-none">{{ site }}</span>
        </div>
      </div>

      <!-- Nav — scrollable, full menu in requested order -->
      <nav v-if="sidebarOpen" class="flex-1 overflow-y-auto py-2 px-2 min-h-0">
        <!-- Dashboard -->
        <NuxtLink
          :to="`/${site}`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path === `/${site}`
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-home" class="w-4 h-4 flex-shrink-0" />
          Dashboard
        </NuxtLink>

        <!-- Páginas -->
        <div class="mt-3 mb-1 px-3">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Páginas</span>
        </div>
        <PageTreeSidebar :site="site" :key="`${site}-${activeVersion}`" />

        <!-- Settings & tools -->
        <div class="border-t border-gray-800 my-2" />
        <NuxtLink
          :to="`/${site}/global`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/global`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 flex-shrink-0" />
          Global
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/design`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/design`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-swatch" class="w-4 h-4 flex-shrink-0" />
          Design
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/settings`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/settings`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4 flex-shrink-0" />
          Configurações
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/stats`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/stats`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 flex-shrink-0" />
          Estatísticas
        </NuxtLink>
        <NuxtLink
          v-if="user?.role === 'admin'"
          :to="`/${site}/users`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/users`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-users" class="w-4 h-4 flex-shrink-0" />
          Utilizadores
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/models`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/models`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-rectangle-group" class="w-4 h-4 flex-shrink-0" />
          Modelos
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/newsletter`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/newsletter`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-envelope" class="w-4 h-4 flex-shrink-0" />
          Newsletter
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/inscricoes`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/inscricoes`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-clipboard-document-list" class="w-4 h-4 flex-shrink-0" />
          Inscrições
        </NuxtLink>
        <NuxtLink
          :to="`/${site}/backups`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/backups`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon name="i-heroicons-archive-box" class="w-4 h-4 flex-shrink-0" />
          Backups
        </NuxtLink>

        <!-- Media & Assistente -->
        <div class="border-t border-gray-800 my-2" />
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
        <NuxtLink
          :to="`/${site}/assistant`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="$route.path.startsWith(`/${site}/assistant`)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <svg viewBox="0 0 20 20" class="w-4 h-4 flex-shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2 L11.5 8.5 L18 10 L11.5 11.5 L10 18 L8.5 11.5 L2 10 L8.5 8.5 Z" fill="currentColor" />
          </svg>
          Assistente
        </NuxtLink>
      </nav>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <slot />
    </div>
  </div>

  <!-- ── Footer — spans full width (sidebar + main) ────────── -->
  <CmsFooter
    :site="site"
    :active-version="activeVersion"
    :editable-versions="editableVersions"
    :switching-version="switchingVersion"
    :last-published="lastPublished"
    :published-from="publishedFrom"
    :is-admin="user?.role === 'admin'"
    @switch-version="switchVersion"
    @versions-updated="refreshSettings"
  />

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
  </div>
</template>
