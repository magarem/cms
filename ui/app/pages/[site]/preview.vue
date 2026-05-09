<script setup lang="ts">
definePageMeta({ layout: "preview" })

const route = useRoute()
const api   = useApi()
const site  = route.params.site as string

// ── Settings + tree ───────────────────────────────────────
const { data: settingsData } = await useAsyncData(`settings-prev-${site}`, () =>
  api.get<{ success: boolean; settings: any; cmsConfig: any }>(`/sites/${site}/settings`)
)

const { data: treeData } = await useAsyncData(`tree-prev-${site}`, () =>
  api.get<{ success: boolean; tree: any[] }>(`/sites/${site}/tree`)
)

const allVersions     = computed<string[]>(() => settingsData.value?.settings?.siteVersions || ["v1"])
const previewUrl      = computed(() => settingsData.value?.cmsConfig?.previewUrl || "")
const selectedVersion = ref(settingsData.value?.settings?.activeEditionVersion || "v1")
const selectedPath    = ref((route.query.path as string) || "/")

// ── Flatten tree into page options ────────────────────────
function flattenTree(nodes: any[]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const node of nodes || []) {
    const slug = node.slug || node.name || ""
    const path = slug.startsWith("/") ? slug : `/${slug}`
    out.push({ label: node.title || node.name || path, value: path })
    if (node.children?.length) out.push(...flattenTree(node.children))
  }
  return out
}

const pageOptions = computed(() => [
  { label: "Início", value: "/" },
  ...flattenTree(treeData.value?.tree || []),
])

// ── Iframe src — only changes on version change (path uses postMessage) ───
const iframeLoadPath = ref(selectedPath.value)
watch(selectedVersion, () => { iframeLoadPath.value = selectedPath.value })

const iframeSrc = computed(() => {
  if (!previewUrl.value) return ""
  const base = previewUrl.value.replace(/\/+$/, "")
  const path = iframeLoadPath.value.startsWith("/") ? iframeLoadPath.value : `/${iframeLoadPath.value}`
  const url  = new URL(base + path)
  url.searchParams.set("version", selectedVersion.value)
  return url.toString()
})

// When path selector changes, navigate inside iframe via router.push (no reload)
const iframeRef = ref<HTMLIFrameElement>()
watch(selectedPath, (newPath, oldPath) => {
  if (newPath === oldPath) return
  iframeRef.value?.contentWindow?.postMessage({ type: 'sirius:goto', path: newPath }, '*')
})

// ── Viewport ──────────────────────────────────────────────
type Viewport = "desktop" | "tablet" | "mobile"
const viewport = ref<Viewport>("desktop")

const viewports: { id: Viewport; icon: string; label: string; width: string }[] = [
  { id: "desktop", icon: "i-heroicons-computer-desktop",    label: "Desktop", width: "100%"  },
  { id: "tablet",  icon: "i-heroicons-device-tablet",       label: "Tablet",  width: "768px" },
  { id: "mobile",  icon: "i-heroicons-device-phone-mobile", label: "Mobile",  width: "390px" },
]

const currentViewport = computed(() => viewports.find(v => v.id === viewport.value)!)

// ── Toolbar visibility ────────────────────────────────────
const toolbarVisible = ref(true)
let hideTimer: ReturnType<typeof setTimeout> | null = null

function showToolbar() {
  toolbarVisible.value = true
  if (hideTimer) clearTimeout(hideTimer)
}

function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { toolbarVisible.value = false }, 3000)
}

function openInTab() {
  if (iframeSrc.value) window.open(iframeSrc.value, "_blank")
}

// Sync iframe navigation → update path selector
onMounted(() => {
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'sirius:navigate') selectedPath.value = e.data.path
  }
  window.addEventListener('message', onMessage)
  onUnmounted(() => window.removeEventListener('message', onMessage))
})


// Back link: root → dashboard, any other page → its CMS editor
const editorPath = computed(() => {
  const p = selectedPath.value
  if (!p || p === "/") return `/${site}`
  return `/${site}/pages${p.startsWith("/") ? p : `/${p}`}`
})
</script>

<template>
  <div
    class="relative w-full h-screen overflow-hidden bg-gray-900"
    
  >

    <!-- ── Floating toolbar ────────────────────────────────── -->
    <Transition name="toolbar">
      <div
        v-show="toolbarVisible"
        class="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 h-11 bg-gray-950/85 backdrop-blur-xl border-b border-white/8 text-white"
        @mouseenter="showToolbar"
      >

        <!-- Back to editor -->
        <NuxtLink
          :to="editorPath"
          class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors shrink-0 pr-3 border-r border-white/10"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Editor</span>
        </NuxtLink>

        <!-- Page picker -->
        <USelect
          :model-value="selectedPath"
          :items="pageOptions"
          size="xs"
          class="w-44 shrink-0"
          @update:model-value="(v: string) => selectedPath = v"
        />

        <!-- Path display -->
        <div class="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 flex-1 min-w-0">
          <UIcon name="i-heroicons-link" class="w-3 h-3 flex-shrink-0 opacity-50" />
          <span class="truncate">{{ iframeSrc || "—" }}</span>
        </div>

        <!-- Version -->
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-[9px] uppercase tracking-widest text-gray-600 hidden md:block">Versão</span>
          <USelect
            v-model="selectedVersion"
            :items="allVersions"
            size="xs"
            class="w-20"
          />
        </div>

        <!-- Viewport switcher -->
        <div class="flex items-center gap-0.5 shrink-0 border-l border-white/10 pl-2 ml-1">
          <UTooltip
            v-for="vp in viewports"
            :key="vp.id"
            :text="vp.label"
          >
            <UButton
              :icon="vp.icon"
              size="xs"
              :color="viewport === vp.id ? 'primary' : 'neutral'"
              :variant="viewport === vp.id ? 'soft' : 'ghost'"
              class="!p-1.5"
              @click="viewport = vp.id"
            />
          </UTooltip>
        </div>

        <!-- Open in tab -->
        <UTooltip text="Abrir em nova aba">
          <UButton
            v-if="previewUrl"
            icon="i-heroicons-arrow-top-right-on-square"
            size="xs"
            variant="ghost"
            color="neutral"
            class="shrink-0"
            @click="openInTab"
          />
        </UTooltip>

      </div>
    </Transition>

    <!-- ── Preview area ───────────────────────────────────── -->
    <div class="w-full h-full flex flex-col items-center justify-start pt-11">

      <!-- No URL configured -->
      <div v-if="!previewUrl" class="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
        <UIcon name="i-heroicons-globe-alt" class="w-14 h-14 opacity-20" />
        <div class="text-center">
          <p class="text-sm font-medium text-gray-400">URL de preview não configurado</p>
          <p class="text-xs text-gray-600 mt-1">Configure em <strong class="text-gray-500">Configurações → Preview</strong></p>
        </div>
        <NuxtLink :to="`/${site}/settings`">
          <UButton size="sm" variant="outline" color="neutral" icon="i-heroicons-cog-6-tooth">
            Ir para Configurações
          </UButton>
        </NuxtLink>
      </div>

      <!-- Iframe wrapper -->
      <template v-else>

        <!-- Device frame (tablet / mobile) -->
        <div
          v-if="viewport !== 'desktop'"
          class="relative h-full flex flex-col items-center"
          :style="{ width: currentViewport.width }"
        >
          <!-- Device label -->
          <div class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-gray-600 py-1.5">
            <UIcon :name="currentViewport.icon" class="w-3 h-3" />
            {{ currentViewport.label }} — {{ currentViewport.width }}
          </div>
          <!-- Device shell -->
          <div class="flex-1 w-full rounded-t-2xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10 border-b-0">
            <iframe
              ref="iframeRef"
              :src="iframeSrc"
              class="w-full h-full border-0 block"
              :key="selectedVersion"
            />
          </div>
        </div>

        <!-- Desktop: full width -->
        <iframe
          v-else
          ref="iframeRef"
          :src="iframeSrc"
          class="w-full flex-1 border-0 block"
          :key="selectedVersion"
        />

      </template>

    </div>

  </div>
</template>

<style scoped>
.toolbar-enter-active,
.toolbar-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toolbar-enter-from,
.toolbar-leave-to     { opacity: 0; transform: translateY(-6px); }
</style>
