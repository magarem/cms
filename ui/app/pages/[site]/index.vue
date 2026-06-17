<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route  = useRoute()
const api    = useApi()
const { user } = useAuth()
const site   = route.params.site as string

const { data: treeData, pending } = await useAsyncData(`tree-${site}`, () =>
  api.get<{ success: boolean; tree: any[]; version: string }>(`/sites/${site}/tree`)
)

const { data: settingsData } = await useAsyncData(`settings-${site}`, () =>
  api.get<{ success: boolean; settings: any; versions: string[]; cmsConfig: any }>(`/sites/${site}/settings`)
)

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0)
}

const totalPages   = computed(() => countNodes(treeData.value?.tree || []))
const activeVer    = computed(() => treeData.value?.version || "v1")
const totalVers    = computed(() => settingsData.value?.versions?.length || 1)
const lastPub      = computed(() => settingsData.value?.settings?.lastPublished ?? null)
const previewUrl   = computed(() => settingsData.value?.cmsConfig?.previewUrl || "")
const isAdmin      = computed(() => user.value?.role === "admin")

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const sections = computed(() => {
  const base = `/${site}`
  const all = [
    {
      label: "Páginas",
      description: "Gerir estrutura e conteúdo das páginas do site",
      icon: "i-heroicons-document-duplicate",
      to: `${base}/pages`,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      stat: totalPages.value ? `${totalPages.value} página${totalPages.value !== 1 ? 's' : ''}` : null,
    },
    {
      label: "Global",
      description: "Configurações globais e dados partilhados entre páginas",
      icon: "i-heroicons-cog-6-tooth",
      to: `${base}/global`,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      stat: null,
    },
    {
      label: "Configurações",
      description: "Preferências do site, domínio e versões de conteúdo",
      icon: "i-heroicons-adjustments-horizontal",
      to: `${base}/settings`,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      stat: `${totalVers.value} versão${totalVers.value !== 1 ? 'ões' : ''}`,
    },
    {
      label: "Estatísticas",
      description: "Visitas, acessos e desempenho do site",
      icon: "i-heroicons-chart-bar",
      to: `${base}/stats`,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      stat: null,
    },
    {
      label: "Utilizadores",
      description: "Contas de acesso ao CMS e permissões de edição",
      icon: "i-heroicons-users",
      to: `${base}/users`,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      stat: null,
      adminOnly: true,
    },
    {
      label: "Modelos",
      description: "Blocos reutilizáveis e componentes de conteúdo",
      icon: "i-heroicons-rectangle-group",
      to: `${base}/models`,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      stat: null,
    },
    {
      label: "Newsletter",
      description: "Gerir subscrições e envio de newsletters",
      icon: "i-heroicons-envelope",
      to: `${base}/newsletter`,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      stat: null,
    },
    {
      label: "Inscrições",
      description: "Formulários e registos submetidos pelos utilizadores",
      icon: "i-heroicons-clipboard-document-list",
      to: `${base}/inscricoes`,
      color: "text-teal-400",
      bg: "bg-teal-500/10",
      border: "border-teal-500/20",
      stat: null,
    },
    {
      label: "Backups",
      description: "Histórico de versões e restauro de conteúdo",
      icon: "i-heroicons-archive-box",
      to: `${base}/backups`,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      stat: null,
    },
    {
      label: "Media",
      description: "Biblioteca de imagens, vídeos e ficheiros",
      icon: "i-heroicons-photo",
      to: `${base}/media`,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "border-pink-500/20",
      stat: null,
    },
    {
      label: "Assistente",
      description: "IA para geração e edição de conteúdo",
      icon: "i-heroicons-sparkles",
      to: `${base}/assistant`,
      color: "text-primary-400",
      bg: "bg-primary-500/10",
      border: "border-primary-500/20",
      stat: null,
    },
  ]
  return all.filter(s => !s.adminOnly || isAdmin.value)
})
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <UIcon name="i-heroicons-home" class="w-4 h-4 text-white" />
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Dashboard</span>
    </template>
    <template #actions>
      <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener">
        <UButton icon="i-heroicons-arrow-top-right-on-square" size="sm" variant="outline" color="neutral">
          Ver site
        </UButton>
      </a>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6 space-y-6">

    <!-- ── Stat strip ───────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <div v-if="pending" class="w-6 h-5 bg-gray-800 rounded animate-pulse" />
          <div v-else class="text-lg font-black text-white leading-none">{{ totalPages }}</div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Páginas</div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-heroicons-tag" class="w-4 h-4 text-primary-400" />
        </div>
        <div>
          <div class="text-lg font-black text-primary-400 leading-none font-mono">{{ activeVer }}</div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Versão ativa</div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <div class="text-lg font-black text-white leading-none">{{ totalVers }}</div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Versões</div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-heroicons-rocket-launch" class="w-4 h-4 text-green-400" />
        </div>
        <div>
          <div v-if="lastPub" class="text-xs font-semibold text-green-400 leading-tight">{{ fmtDate(lastPub) }}</div>
          <div v-else class="text-xs text-gray-600 leading-tight">Nunca publicado</div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">Última publicação</div>
        </div>
      </div>
    </div>

    <!-- ── Section cards ─────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <NuxtLink
        v-for="s in sections"
        :key="s.to"
        :to="s.to"
        class="group bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-700 hover:bg-gray-800/60 transition-all duration-150"
      >
        <div class="flex items-start justify-between">
          <div :class="[s.bg, s.border, 'w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0']">
            <UIcon :name="s.icon" :class="['w-5 h-5', s.color]" />
          </div>
          <UIcon name="i-heroicons-arrow-up-right" class="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition-colors mt-1" />
        </div>
        <div class="space-y-1">
          <div class="text-sm font-semibold text-white leading-none">{{ s.label }}</div>
          <div class="text-[11px] text-gray-500 leading-snug">{{ s.description }}</div>
        </div>
        <div v-if="s.stat" :class="['text-xs font-medium', s.color]">{{ s.stat }}</div>
      </NuxtLink>
    </div>

  </div>
</template>
