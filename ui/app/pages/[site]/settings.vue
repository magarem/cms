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

const siteUrl              = ref("")
const previewUrl           = ref("")
const googleAnalyticsId    = ref("")
const whatsappNumber          = ref("")
const instagramAccessToken    = ref("")
const schemaType              = ref("WebSite")
const siteVersions         = ref<string[]>(["v1"])
const activeEditionVersion = ref("v1")
const defaultSiteVersion   = ref("v1")
const breadcrumbMode         = ref("complete")
const showPageTitle          = ref(true)
const blocksGap              = ref("md")
const pageVerticalPadding    = ref("none")

const editableVersions = computed(() => siteVersions.value.filter(v => v !== "production"))

watch(data, (val) => {
  if (!val) return
  siteUrl.value              = val.settings?.siteUrl      || ""
  previewUrl.value           = val.cmsConfig?.previewUrl || ""
  googleAnalyticsId.value    = val.cmsConfig?.googleAnalyticsId || ""
  whatsappNumber.value          = val.cmsConfig?.whatsappNumber       || ""
  instagramAccessToken.value    = val.cmsConfig?.instagramAccessToken || ""
  schemaType.value              = val.cmsConfig?.schemaType           || "WebSite"
  siteVersions.value         = val.settings?.siteVersions || ["v1"]
  activeEditionVersion.value = val.settings?.activeEditionVersion || "v1"
  defaultSiteVersion.value   = val.settings?.defaultSiteVersion || "v1"
  breadcrumbMode.value         = val.settings?.breadcrumbMode        || "complete"
  showPageTitle.value          = val.settings?.showPageTitle         !== false
  blocksGap.value              = val.settings?.blocksGap            || "md"
  pageVerticalPadding.value    = val.settings?.pageVerticalPadding   || "none"
}, { immediate: true })

// ── Save settings ─────────────────────────────────────────
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await api.put(`/sites/${site}/settings`, {
      activeEditionVersion: activeEditionVersion.value,
      defaultSiteVersion: defaultSiteVersion.value,
      breadcrumbMode: breadcrumbMode.value,
      showPageTitle: showPageTitle.value,
      blocksGap: blocksGap.value,
      pageVerticalPadding: pageVerticalPadding.value,
      siteUrl: siteUrl.value,
      cmsConfig: { previewUrl: previewUrl.value, googleAnalyticsId: googleAnalyticsId.value, whatsappNumber: whatsappNumber.value, instagramAccessToken: instagramAccessToken.value, schemaType: schemaType.value },
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
    <div class="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

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

      <!-- Public URL card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <span class="text-sm font-semibold text-white">URL pública</span>
        </template>
        <UFormField label="URL do site em produção">
          <UInput
            v-model="siteUrl"
            placeholder="https://meusite.com"
            class="w-full"
            icon="i-heroicons-globe-alt"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          URL onde o site está publicado. Aparece no portal do cliente como link "Visitar website".
        </p>
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

      <!-- Breadcrumbs card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-map" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-white">Breadcrumbs</span>
          </div>
        </template>
        <UFormField label="Comportamento dos breadcrumbs">
          <div class="flex flex-col gap-2 mt-1">
            <label
              v-for="opt in [
                { value: 'complete',     label: 'Completo',          desc: 'Início › Serviços › Design' },
                { value: 'parents-only', label: 'Só os pais',        desc: 'Início › Serviços (sem a página atual)' },
                { value: 'hidden',       label: 'Desligado',         desc: 'Breadcrumbs não são exibidos' },
              ]"
              :key="opt.value"
              class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
              :class="breadcrumbMode === opt.value
                ? 'border-primary-500/50 bg-primary-500/5'
                : 'border-gray-800 hover:border-gray-700'"
              @click="breadcrumbMode = opt.value"
            >
              <div class="w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                :class="breadcrumbMode === opt.value ? 'border-primary-400' : 'border-gray-600'">
                <div v-if="breadcrumbMode === opt.value" class="w-2 h-2 rounded-full bg-primary-400" />
              </div>
              <div>
                <p class="text-sm font-medium text-white">{{ opt.label }}</p>
                <p class="text-xs text-gray-500 mt-0.5 font-mono">{{ opt.desc }}</p>
              </div>
            </label>
          </div>
        </UFormField>
      </UCard>

      <!-- Show page title card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-h1" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-white">Título da página</span>
          </div>
        </template>
        <UFormField label="Exibir título e descrição automáticos no topo de cada página">
          <div class="flex items-center justify-between mt-2">
            <span class="text-sm text-gray-400">{{ showPageTitle ? 'Visível' : 'Oculto' }}</span>
            <UToggle v-model="showPageTitle" />
          </div>
        </UFormField>
      </UCard>

      <!-- Blocks gap card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrows-up-down" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-white">Espaço entre blocos</span>
          </div>
        </template>
        <UFormField label="Gap vertical entre cada bloco de conteúdo">
          <div class="flex flex-col gap-2 mt-1">
            <label
              v-for="opt in [
                { value: 'none', label: 'Nenhum',       desc: '0 px — blocos colados' },
                { value: 'sm',   label: 'Pequeno',      desc: '12 px' },
                { value: 'md',   label: 'Médio',        desc: '24 px — padrão' },
                { value: 'lg',   label: 'Grande',       desc: '48 px' },
                { value: 'xl',   label: 'Extra-largo',  desc: '80 px' },
              ]"
              :key="opt.value"
              class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
              :class="blocksGap === opt.value
                ? 'border-primary-500/50 bg-primary-500/5'
                : 'border-gray-800 hover:border-gray-700'"
              @click="blocksGap = opt.value"
            >
              <div class="w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                :class="blocksGap === opt.value ? 'border-primary-400' : 'border-gray-600'">
                <div v-if="blocksGap === opt.value" class="w-2 h-2 rounded-full bg-primary-400" />
              </div>
              <div>
                <p class="text-sm font-medium text-white">{{ opt.label }}</p>
                <p class="text-xs text-gray-500 mt-0.5 font-mono">{{ opt.desc }}</p>
              </div>
            </label>
          </div>
        </UFormField>
      </UCard>

      <!-- Page vertical padding card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrows-pointing-out" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-white">Margem vertical da página</span>
          </div>
        </template>
        <UFormField label="Espaço extra no topo e rodapé da área de conteúdo">
          <div class="flex flex-col gap-2 mt-1">
            <label
              v-for="opt in [
                { value: 'none', label: 'Nenhuma',      desc: '0 px — sem margem extra (padrão)' },
                { value: 'sm',   label: 'Pequena',      desc: '24 px' },
                { value: 'md',   label: 'Média',        desc: '48 px' },
                { value: 'lg',   label: 'Grande',       desc: '80 px' },
                { value: 'xl',   label: 'Extra-larga',  desc: '128 px' },
              ]"
              :key="opt.value"
              class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
              :class="pageVerticalPadding === opt.value
                ? 'border-primary-500/50 bg-primary-500/5'
                : 'border-gray-800 hover:border-gray-700'"
              @click="pageVerticalPadding = opt.value"
            >
              <div class="w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                :class="pageVerticalPadding === opt.value ? 'border-primary-400' : 'border-gray-600'">
                <div v-if="pageVerticalPadding === opt.value" class="w-2 h-2 rounded-full bg-primary-400" />
              </div>
              <div>
                <p class="text-sm font-medium text-white">{{ opt.label }}</p>
                <p class="text-xs text-gray-500 mt-0.5 font-mono">{{ opt.desc }}</p>
              </div>
            </label>
          </div>
        </UFormField>
      </UCard>

      <!-- Schema.org card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-code-bracket" class="w-4 h-4 text-gray-400" />
            <span class="text-sm font-semibold text-white">Schema.org (SEO estruturado)</span>
          </div>
        </template>
        <UFormField label="Tipo de negócio (homepage)">
          <USelect
            v-model="schemaType"
            :options="[
              { label: 'WebSite (genérico)', value: 'WebSite' },
              { label: 'LodgingBusiness (hospedagem)', value: 'LodgingBusiness' },
              { label: 'BedAndBreakfast (pousada / B&B)', value: 'BedAndBreakfast' },
              { label: 'Hotel', value: 'Hotel' },
              { label: 'Restaurant (restaurante)', value: 'Restaurant' },
              { label: 'LocalBusiness (negócio local)', value: 'LocalBusiness' },
            ]"
            class="w-full"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          Define o tipo de Schema.org emitido na página inicial para motores de busca.
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

      <!-- Instagram card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f09433"/><stop offset="25%" stop-color="#e6683c"/><stop offset="50%" stop-color="#dc2743"/><stop offset="75%" stop-color="#cc2366"/><stop offset="100%" stop-color="#bc1888"/></linearGradient></defs>
              <rect width="24" height="24" rx="6" fill="url(#ig-grad)"/>
              <circle cx="12" cy="12" r="4" stroke="white" stroke-width="1.8" fill="none"/>
              <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
            </svg>
            <span class="text-sm font-semibold text-white">Instagram</span>
            <UBadge v-if="instagramAccessToken" color="success" variant="subtle" size="xs">Activo</UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="xs">Inactivo</UBadge>
          </div>
        </template>
        <UFormField label="Access Token (Instagram Graph API)">
          <UInput
            v-model="instagramAccessToken"
            placeholder="IGQVJx..."
            type="password"
            class="w-full font-mono"
            icon="i-heroicons-key"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          Crie uma app no Facebook Developers → Instagram Basic Display → gere um token de longa duração. Activa o bloco InstagramFeed no site.
        </p>
      </UCard>

      <!-- WhatsApp card -->
      <UCard class="bg-gray-900 border-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.523 5.845L.057 23.882a.5.5 0 0 0 .61.61l6.037-1.466A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.944 9.944 0 0 1-5.189-1.453l-.37-.22-3.838.932.95-3.838-.242-.384A9.944 9.944 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            <span class="text-sm font-semibold text-white">WhatsApp</span>
            <UBadge v-if="whatsappNumber" color="success" variant="subtle" size="xs">Activo</UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="xs">Inactivo</UBadge>
          </div>
        </template>
        <UFormField label="Número (com DDI, ex: 5511999999999)">
          <UInput
            v-model="whatsappNumber"
            placeholder="5573999999999"
            class="w-full font-mono"
            icon="i-heroicons-phone"
          />
        </UFormField>
        <p class="text-xs text-gray-500 mt-2">
          Apenas dígitos, com código do país e DDD. Activa o botão flutuante de WhatsApp no site.
        </p>
      </UCard>

    </div><!-- /grid -->
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
