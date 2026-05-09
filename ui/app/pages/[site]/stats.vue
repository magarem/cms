<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api   = useApi()
const site  = route.params.site as string

const period = ref<30 | 7>(30)

const { data, pending, refresh } = await useAsyncData(
  `analytics-${site}-${period.value}`,
  () => api.get<any>(`/sites/${site}/analytics?days=${period.value}`),
  { watch: [period], server: false }
)

const days      = computed(() => data.value?.days     || [])
const topPages  = computed(() => data.value?.topPages || [])
const topRefs   = computed(() => data.value?.topRefs  || [])
const devices   = computed(() => data.value?.devices  || { desktop: 0, mobile: 0, tablet: 0 })
const totals    = computed(() => data.value?.totals   || { views: 0, visitors: 0 })

const today     = computed(() => days.value[days.value.length - 1] || { views: 0, visitors: 0 })
const yesterday = computed(() => days.value[days.value.length - 2] || { views: 0, visitors: 0 })

const maxViews = computed(() => Math.max(...days.value.map((d: any) => d.views), 1))

function pct(v: number) { return Math.round((v / maxViews.value) * 100) }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
}

function devicePct(key: string) {
  const total = (devices.value.desktop || 0) + (devices.value.mobile || 0) + (devices.value.tablet || 0)
  if (!total) return 0
  return Math.round(((devices.value[key] || 0) / total) * 100)
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Estatísticas</span>
    </template>
    <template #actions>
      <div class="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
        <button
          v-for="p in [7, 30]"
          :key="p"
          class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
          :class="period === p ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'"
          @click="period = p as 7 | 30"
        >
          {{ p }}d
        </button>
      </div>
    </template>
  </CmsTopbar>

  <div class="flex-1 overflow-auto p-6">
    <div v-if="pending" class="flex justify-center py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-500" />
    </div>

    <template v-else>

      <!-- ── Summary cards ──────────────────────────────────── -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Visitas hoje</p>
          <p class="text-2xl font-bold text-white">{{ today.views.toLocaleString("pt-PT") }}</p>
          <p class="text-xs text-gray-600 mt-0.5">ontem: {{ yesterday.views.toLocaleString("pt-PT") }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Visitantes hoje</p>
          <p class="text-2xl font-bold text-white">{{ today.visitors.toLocaleString("pt-PT") }}</p>
          <p class="text-xs text-gray-600 mt-0.5">ontem: {{ yesterday.visitors.toLocaleString("pt-PT") }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Visitas ({{ period }}d)</p>
          <p class="text-2xl font-bold text-white">{{ totals.views.toLocaleString("pt-PT") }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Visitantes ({{ period }}d)</p>
          <p class="text-2xl font-bold text-white">{{ totals.visitors.toLocaleString("pt-PT") }}</p>
        </div>
      </div>

      <!-- ── Daily chart ────────────────────────────────────── -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <p class="text-xs font-semibold text-gray-400 mb-4">Visitas diárias</p>
        <div class="flex items-end gap-1 h-28">
          <div
            v-for="d in days"
            :key="d.date"
            class="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div class="w-full rounded-sm bg-primary-500/70 hover:bg-primary-400 transition-colors"
                 :style="{ height: pct(d.views) + '%', minHeight: d.views ? '2px' : '0' }"
            />
            <!-- Tooltip -->
            <div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
              <div class="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-[10px] whitespace-nowrap text-white">
                {{ fmtDate(d.date) }}: <span class="font-bold">{{ d.views }}</span> visitas
              </div>
            </div>
          </div>
        </div>
        <!-- X-axis labels (show ~7 evenly spaced) -->
        <div class="flex items-end mt-2" style="gap: inherit">
          <template v-for="(d, i) in days" :key="d.date">
            <div class="flex-1 text-center text-[9px] text-gray-700 truncate"
                 v-if="i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 6) === 0">
              {{ fmtDate(d.date) }}
            </div>
            <div class="flex-1" v-else />
          </template>
        </div>
      </div>

      <!-- ── Tables + devices ───────────────────────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- Top pages -->
        <div class="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p class="text-xs font-semibold text-gray-400 mb-3">Páginas mais visitadas</p>
          <div v-if="!topPages.length" class="text-xs text-gray-600 py-4 text-center">Sem dados</div>
          <div v-else class="space-y-2">
            <div v-for="(p, i) in topPages" :key="p.path" class="flex items-center gap-2">
              <span class="text-[10px] text-gray-600 w-4 text-right flex-shrink-0">{{ i + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs text-gray-300 font-mono truncate">{{ p.path }}</span>
                  <span class="text-xs text-gray-400 font-medium flex-shrink-0">{{ p.views.toLocaleString("pt-PT") }}</span>
                </div>
                <div class="mt-0.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-primary-500/50 rounded-full"
                       :style="{ width: Math.round((p.views / topPages[0].views) * 100) + '%' }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Top referrers -->
        <div class="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p class="text-xs font-semibold text-gray-400 mb-3">Origens de tráfego</p>
          <div v-if="!topRefs.length" class="text-xs text-gray-600 py-4 text-center">Sem dados</div>
          <div v-else class="space-y-2">
            <div v-for="(r, i) in topRefs" :key="r.ref" class="flex items-center gap-2">
              <span class="text-[10px] text-gray-600 w-4 text-right flex-shrink-0">{{ i + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs text-gray-300 truncate">{{ r.ref || "direto" }}</span>
                  <span class="text-xs text-gray-400 font-medium flex-shrink-0">{{ r.views.toLocaleString("pt-PT") }}</span>
                </div>
                <div class="mt-0.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-green-500/50 rounded-full"
                       :style="{ width: Math.round((r.views / topRefs[0].views) * 100) + '%' }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Devices -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p class="text-xs font-semibold text-gray-400 mb-4">Dispositivos</p>
          <div class="space-y-3">
            <div v-for="[key, icon, label] in [['desktop','i-heroicons-computer-desktop','Desktop'],['mobile','i-heroicons-device-phone-mobile','Mobile'],['tablet','i-heroicons-device-tablet','Tablet']]"
                 :key="key"
                 class="flex items-center gap-3">
              <UIcon :name="icon" class="w-4 h-4 text-gray-500 flex-shrink-0" />
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-400">{{ label }}</span>
                  <span class="text-xs text-gray-400 font-medium">{{ devicePct(key) }}%</span>
                </div>
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                       :class="key === 'desktop' ? 'bg-primary-500/70' : key === 'mobile' ? 'bg-amber-500/70' : 'bg-teal-500/70'"
                       :style="{ width: devicePct(key) + '%' }" />
                </div>
              </div>
              <span class="text-xs text-gray-600 w-10 text-right flex-shrink-0">
                {{ (devices[key] || 0).toLocaleString("pt-PT") }}
              </span>
            </div>
          </div>
        </div>

      </div>

    </template>
  </div>
</template>
