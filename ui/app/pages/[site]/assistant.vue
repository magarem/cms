<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api   = useApi()
const toast = useToast()

const site = computed(() => route.params.site as string)

// ── State ────────────────────────────────────────────────
const prompt   = ref("")
const loading  = ref(false)
const phase    = ref<"idle" | "preview" | "done">("idle")
const spec     = ref<{ pages: any[] } | null>(null)
const results  = ref<{ path: string; status: string; error?: string }[] | null>(null)
const errorMsg = ref<string | null>(null)

const EXAMPLES = [
  "Site para um estúdio de yoga em Lisboa. Páginas: home com hero e slide de fotos, sobre nós, horários e aulas, preços, contacto com formulário.",
  "Portfólio para designer gráfico freelancer. Páginas: home, sobre, projetos (coleção), serviços, contacto.",
  "Restaurante tradicional português. Páginas: home, ementa, história, localização e reservas, galeria de fotos.",
  "Site institucional para clínica médica. Páginas: home, especialidades, equipa, marcações, contactos.",
]

// ── Actions ──────────────────────────────────────────────
async function preview() {
  if (!prompt.value.trim() || loading.value) return
  loading.value = true
  phase.value   = "idle"
  spec.value    = null
  results.value = null
  errorMsg.value = null

  try {
    const res = await api.post<any>(`/sites/${site.value}/agent/generate`, {
      prompt: prompt.value,
      dryRun: true,
    })
    spec.value  = res.spec
    phase.value = "preview"
  } catch (err: any) {
    errorMsg.value = err.data?.error || err.message || "Erro desconhecido."
    toast.add({ title: errorMsg.value!, color: "error" })
  } finally {
    loading.value = false
  }
}

async function applySpec() {
  if (!prompt.value.trim() || loading.value) return
  loading.value = true
  errorMsg.value = null

  try {
    const res = await api.post<any>(`/sites/${site.value}/agent/generate`, {
      prompt: prompt.value,
      dryRun: false,
    })
    spec.value    = res.spec
    results.value = res.results
    phase.value   = "done"

    const created = res.results.filter((r: any) => r.status === "created").length
    const updated = res.results.filter((r: any) => r.status === "updated").length
    if (created + updated > 0) {
      toast.add({ title: `${created + updated} página(s) gerada(s) com sucesso.`, color: "success" })
    }
  } catch (err: any) {
    errorMsg.value = err.data?.error || err.message || "Erro desconhecido."
    toast.add({ title: errorMsg.value!, color: "error" })
  } finally {
    loading.value = false
  }
}

async function generate() {
  if (!prompt.value.trim() || loading.value) return
  loading.value = true
  phase.value   = "idle"
  spec.value    = null
  results.value = null
  errorMsg.value = null

  try {
    const res = await api.post<any>(`/sites/${site.value}/agent/generate`, {
      prompt: prompt.value,
      dryRun: false,
    })
    spec.value    = res.spec
    results.value = res.results
    phase.value   = "done"

    const created = res.results.filter((r: any) => r.status === "created").length
    const updated = res.results.filter((r: any) => r.status === "updated").length
    toast.add({ title: `${created + updated} página(s) gerada(s) com sucesso.`, color: "success" })
  } catch (err: any) {
    errorMsg.value = err.data?.error || err.message || "Erro desconhecido."
    toast.add({ title: errorMsg.value!, color: "error" })
  } finally {
    loading.value = false
  }
}

function reset() {
  phase.value    = "idle"
  spec.value     = null
  results.value  = null
  errorMsg.value = null
}

// ── Helpers ──────────────────────────────────────────────
function blockSummary(blocks: any[]): string {
  if (!blocks?.length) return "sem blocos"
  return blocks.map((b: any) => b.componentName).join(", ")
}

function resultColor(status: string) {
  if (status === "created") return "text-green-400"
  if (status === "updated") return "text-blue-400"
  if (status === "skipped") return "text-gray-500"
  return "text-red-400"
}

function resultIcon(status: string) {
  if (status === "created") return "i-heroicons-plus-circle"
  if (status === "updated") return "i-heroicons-arrow-path"
  if (status === "skipped") return "i-heroicons-minus-circle"
  return "i-heroicons-x-circle"
}

function resultLabel(status: string) {
  if (status === "created") return "criada"
  if (status === "updated") return "atualizada"
  if (status === "skipped") return "ignorada"
  return "erro"
}

function pageUrl(pagePath: string) {
  const clean = pagePath === "/" ? "" : pagePath
  return `/${site.value}/pages/${clean}`
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Assistente</span>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">
    <div class="max-w-2xl mx-auto space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 flex-shrink-0">
          <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2 L11.5 8.5 L18 10 L11.5 11.5 L10 18 L8.5 11.5 L2 10 L8.5 8.5 Z" fill="white" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-semibold text-white">Assistente IA</h1>
          <p class="text-sm text-gray-500">Descreva o site e a IA constrói as páginas por si.</p>
        </div>
      </div>

      <!-- Prompt area -->
      <div class="space-y-3">
        <textarea
          v-model="prompt"
          :disabled="loading"
          rows="7"
          placeholder="Ex: Site para um estúdio de yoga em Lisboa. Páginas: home com hero e slideshow de fotos, sobre nós, horários e aulas, preços, contacto com formulário."
          class="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 transition-colors disabled:opacity-50"
        />

        <!-- Example chips -->
        <div class="flex flex-wrap gap-2">
          <span class="text-xs text-gray-600 self-center">Exemplos:</span>
          <button
            v-for="ex in EXAMPLES"
            :key="ex"
            :disabled="loading"
            class="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-400 hover:border-primary-500/50 hover:text-primary-400 transition-colors disabled:opacity-40"
            @click="prompt = ex"
          >
            {{ ex.split('.')[0] }}
          </button>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-3">
        <UButton
          icon="i-heroicons-sparkles"
          size="md"
          color="primary"
          :loading="loading && phase === 'idle'"
          :disabled="!prompt.trim() || loading"
          @click="generate"
        >
          Gerar site
        </UButton>

        <UButton
          icon="i-heroicons-eye"
          size="md"
          color="neutral"
          variant="subtle"
          :loading="loading && phase === 'idle'"
          :disabled="!prompt.trim() || loading"
          @click="preview"
        >
          Pré-visualizar plano
        </UButton>

        <button
          v-if="phase !== 'idle'"
          class="text-xs text-gray-600 hover:text-gray-400 transition-colors ml-auto"
          @click="reset"
        >
          Limpar
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div class="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin flex-shrink-0" />
        <div>
          <p class="text-sm text-white font-medium">A construir com IA…</p>
          <p class="text-xs text-gray-500 mt-0.5">Pode demorar até 30 segundos.</p>
        </div>
      </div>

      <!-- Error -->
      <div v-if="errorMsg && !loading" class="flex items-start gap-3 bg-red-950/40 border border-red-800/50 rounded-xl p-4">
        <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <p class="text-sm text-red-300">{{ errorMsg }}</p>
      </div>

      <!-- Preview panel -->
      <div v-if="phase === 'preview' && spec && !loading" class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">
            Plano gerado —
            <span class="text-primary-400">{{ spec.pages.length }} página(s)</span>
          </h2>
          <UButton
            icon="i-heroicons-rocket-launch"
            size="sm"
            color="primary"
            @click="applySpec"
          >
            Aplicar plano
          </UButton>
        </div>

        <div class="border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/70">
          <div
            v-for="page in spec.pages"
            :key="page.path"
            class="px-4 py-3 bg-gray-900/50 hover:bg-gray-900 transition-colors"
          >
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-xs text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">
                /{{ page.path || '' }}
              </span>
              <span class="text-sm text-white font-medium">{{ page.title }}</span>
            </div>
            <p class="text-xs text-gray-500 mt-1 ml-0.5">
              {{ blockSummary(page.blocks) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Done panel -->
      <div v-if="phase === 'done' && results && !loading" class="space-y-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-400" />
          <h2 class="text-sm font-semibold text-white">
            Concluído —
            <span class="text-green-400">
              {{ results.filter(r => r.status === 'created' || r.status === 'updated').length }} página(s) gerada(s)
            </span>
          </h2>
        </div>

        <div class="border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/70">
          <div
            v-for="r in results"
            :key="r.path"
            class="flex items-center gap-3 px-4 py-3 bg-gray-900/50"
          >
            <UIcon :name="resultIcon(r.status)" class="w-4 h-4 flex-shrink-0" :class="resultColor(r.status)" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-mono text-xs text-gray-400">/{{ r.path }}</span>
                <span class="text-xs" :class="resultColor(r.status)">{{ resultLabel(r.status) }}</span>
              </div>
              <p v-if="r.error" class="text-xs text-red-400 mt-0.5">{{ r.error }}</p>
            </div>
            <NuxtLink
              v-if="r.status === 'created' || r.status === 'updated'"
              :to="pageUrl(r.path)"
              class="text-xs text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0 flex items-center gap-1"
            >
              Abrir
              <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
            </NuxtLink>
          </div>
        </div>

        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="neutral"
          variant="subtle"
          @click="reset"
        >
          Novo prompt
        </UButton>
      </div>

    </div>
  </div>
</template>
