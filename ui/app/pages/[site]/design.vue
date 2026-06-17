<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api   = useApi()
const toast = useToast()
const site  = route.params.site as string

const previewUrl = `/${site}/preview?path=/`

const previewMenuItems = [[
  {
    label: 'Mesma aba',
    icon: 'i-heroicons-eye',
    onSelect: () => navigateTo(previewUrl),
  },
  {
    label: 'Nova aba',
    icon: 'i-heroicons-arrow-top-right-on-square',
    onSelect: () => window.open(previewUrl, '_blank'),
  },
]]

// ── Types ─────────────────────────────────────────────────
interface ThemeColors {
  "--color-primary": string
  "--color-secondary": string
  "--color-accent": string
  "--color-bg-base": string
  "--color-bg-muted": string
  "--color-text-main": string
  "--color-text-muted": string
  "--color-border": string
  "--font-sans"?: string
  "--font-serif"?: string
  "--radius-botao"?: string
  "--radius-cartao"?: string
  "--max-width-site"?: string
  "--max-width-content"?: string
  "--max-width-copy"?: string
}

interface ThemePreset {
  id: string
  name: string
  description: string
  adaptiveMode: boolean
  defaultColorMode?: "light" | "dark" | "system"
  light: ThemeColors
  dark?: Partial<ThemeColors>
}

// ── Color var metadata (labels + type) ────────────────────
const COLOR_VARS: { key: keyof ThemeColors; label: string }[] = [
  { key: "--color-primary",    label: "Cor principal"     },
  { key: "--color-secondary",  label: "Cor secundária"    },
  { key: "--color-accent",     label: "Cor de destaque"   },
  { key: "--color-bg-base",    label: "Fundo base"        },
  { key: "--color-bg-muted",   label: "Fundo suave"       },
  { key: "--color-text-main",  label: "Texto principal"   },
  { key: "--color-text-muted", label: "Texto secundário"  },
  { key: "--color-border",     label: "Bordas"            },
]

// ── Load ──────────────────────────────────────────────────
const { data, refresh } = await useAsyncData(`design-${site}`, () =>
  api.get<{ success: boolean; presets: ThemePreset[]; theme: any; activePreset: string }>(`/sites/${site}/design`),
  { server: false }
)

const presets = computed<ThemePreset[]>(() => data.value?.presets ?? [])

// ── Editable state ────────────────────────────────────────
const selectedPresetId = ref("basic")
const lightColors      = ref<ThemeColors>({} as ThemeColors)
const darkOverrides    = ref<Record<string, { enabled: boolean; value: string }>>({})
const defaultColorMode = ref<"light" | "dark" | "system">("system")
const fontSans         = ref("")
const fontSerif        = ref("")
const radiusBotao      = ref("")
const radiusCartao     = ref("")
const maxWidthSite     = ref("")
const maxWidthContent  = ref("")
const maxWidthCopy     = ref("")

function loadFromTheme(preset: ThemePreset, existingTheme: any) {
  // Only use saved values when they actually belong to this preset.
  // Legacy themes (saved before presetId existed) are accepted if their primary color matches.
  const savedBelongsToPreset =
    existingTheme?.presetId === preset.id ||
    (existingTheme?.presetId === undefined &&
      existingTheme?.light?.["--color-primary"] === preset.light["--color-primary"])

  const src = savedBelongsToPreset ? existingTheme.light : preset.light
  lightColors.value = { ...preset.light, ...src }

  // Populate non-color fields
  fontSans.value        = lightColors.value["--font-sans"]         ?? "'Inter', system-ui, sans-serif"
  fontSerif.value       = lightColors.value["--font-serif"]        ?? "'Merriweather', serif"
  radiusBotao.value     = lightColors.value["--radius-botao"]      ?? "12px"
  radiusCartao.value    = lightColors.value["--radius-cartao"]      ?? "24px"
  maxWidthSite.value    = lightColors.value["--max-width-site"]    ?? "1440px"
  maxWidthContent.value = lightColors.value["--max-width-content"] ?? "1200px"
  maxWidthCopy.value    = lightColors.value["--max-width-copy"]    ?? "800px"

  defaultColorMode.value =
    (savedBelongsToPreset ? existingTheme?.defaultColorMode : null)
      ?? preset.defaultColorMode ?? "system"

  // Dark overrides — only relevant for Basic preset
  const darkSrc = savedBelongsToPreset && existingTheme?.dark
    ? existingTheme.dark
    : preset.dark ?? {}
  const overrides: Record<string, { enabled: boolean; value: string }> = {}
  for (const { key } of COLOR_VARS) {
    overrides[key] = {
      enabled: key in darkSrc,
      value:   darkSrc[key] ?? lightColors.value[key] ?? "#000000",
    }
  }
  darkOverrides.value = overrides
}

function applyPreset(preset: ThemePreset) {
  selectedPresetId.value = preset.id
  loadFromTheme(preset, null)
}

watch(data, (val) => {
  if (!val) return
  selectedPresetId.value = val.activePreset ?? "basic"
  const preset = val.presets.find(p => p.id === selectedPresetId.value) ?? val.presets[0]
  if (preset) loadFromTheme(preset, val.theme)
}, { immediate: true })

// ── Build theme.json payload ──────────────────────────────
function buildThemePayload() {
  const light: any = {
    ...lightColors.value,
    "--font-sans":         fontSans.value,
    "--font-serif":        fontSerif.value,
    "--radius-botao":      radiusBotao.value,
    "--radius-cartao":     radiusCartao.value,
    "--max-width-site":    maxWidthSite.value,
    "--max-width-content": maxWidthContent.value,
    "--max-width-copy":    maxWidthCopy.value,
  }

  const activePreset = presets.value.find(p => p.id === selectedPresetId.value)
  const presetId = selectedPresetId.value

  if (!activePreset?.adaptiveMode) return { presetId, light }

  const dark: any = {}
  for (const [key, ov] of Object.entries(darkOverrides.value)) {
    if (ov.enabled) dark[key] = ov.value
  }
  return { presetId, defaultColorMode: defaultColorMode.value, light, dark }
}

// ── Save ──────────────────────────────────────────────────
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    await api.put(`/sites/${site}/design`, {
      activePreset: selectedPresetId.value,
      theme: buildThemePayload(),
    })
    toast.add({ title: "Design guardado.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro ao guardar design.", color: "error" })
  } finally {
    saving.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────
const activePresetObj = computed(() =>
  presets.value.find(p => p.id === selectedPresetId.value)
)

function isHex(v: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v?.trim() ?? "")
}

// Normalize to 6-digit hex for <input type="color">
function toInputColor(v: string): string {
  const hex = v?.trim()
  if (!hex) return "#000000"
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
  }
  return "#000000"
}

const COLOR_MODE_OPTS = [
  { value: "light",  label: "Claro",   icon: "i-heroicons-sun" },
  { value: "dark",   label: "Escuro",  icon: "i-heroicons-moon" },
  { value: "system", label: "Sistema", icon: "i-heroicons-computer-desktop" },
]
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Topbar -->
    <CmsTopbar :site="site">
      <template #breadcrumb>
        <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
          <UIcon name="i-heroicons-home" class="w-4 h-4" />
        </NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
        <span class="text-white font-medium">Design</span>
      </template>
      <template #actions>
        <UButtonGroup>
          <UButton icon="i-heroicons-eye" size="sm" variant="outline" color="neutral" @click="navigateTo(previewUrl)">
            Preview
          </UButton>
          <UDropdownMenu :items="previewMenuItems">
            <UButton icon="i-heroicons-chevron-down" size="sm" variant="outline" color="neutral" />
          </UDropdownMenu>
        </UButtonGroup>
        <UButton :loading="saving" icon="i-heroicons-check" size="sm" @click="save">
          Guardar
        </UButton>
      </template>
    </CmsTopbar>

    <!-- Body: two-panel layout -->
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- Left: preset picker -->
      <aside class="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 overflow-y-auto p-3 space-y-2">
        <p class="text-[10px] uppercase tracking-widest text-gray-600 px-1 mb-3">Tema</p>

        <button
          v-for="preset in presets"
          :key="preset.id"
          class="w-full rounded-xl p-3 text-left transition-all border"
          :class="selectedPresetId === preset.id
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-gray-800 hover:border-gray-700 bg-gray-800/40 hover:bg-gray-800/70'"
          @click="applyPreset(preset)"
        >
          <!-- Mini swatch strip -->
          <div class="flex gap-1 mb-2">
            <span
              class="w-5 h-5 rounded-full border border-black/20 flex-shrink-0"
              :style="{ background: preset.light['--color-primary'] }"
            />
            <span
              class="w-5 h-5 rounded-full border border-black/20 flex-shrink-0"
              :style="{ background: preset.light['--color-bg-base'] }"
            />
            <span
              class="w-5 h-5 rounded-full border border-black/20 flex-shrink-0"
              :style="{ background: preset.light['--color-accent'] }"
            />
            <span
              class="w-5 h-5 rounded-full border border-black/20 flex-shrink-0"
              :style="{ background: preset.light['--color-text-main'] }"
            />
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-white">{{ preset.name }}</span>
            <UIcon
              v-if="selectedPresetId === preset.id"
              name="i-heroicons-check-circle"
              class="w-4 h-4 text-primary-400 flex-shrink-0"
            />
          </div>
          <p class="text-[11px] text-gray-500 mt-0.5 leading-snug">{{ preset.description }}</p>

          <!-- Adaptive badge -->
          <div
            v-if="preset.adaptiveMode"
            class="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5"
          >
            <UIcon name="i-heroicons-sun" class="w-3 h-3" />
            claro/escuro
          </div>
        </button>
      </aside>

      <!-- Right: editor -->
      <main class="flex-1 overflow-y-auto p-6 space-y-6">

        <!-- Section: Light colors -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <UIcon name="i-heroicons-sun" class="w-4 h-4 text-amber-400" />
            <h3 class="text-sm font-semibold text-white">Cores — modo claro</h3>
          </div>
          <div class="divide-y divide-gray-800/60">
            <div
              v-for="{ key, label } in COLOR_VARS"
              :key="key"
              class="flex items-center gap-3 px-4 py-2.5"
            >
              <!-- Color picker -->
              <div class="relative w-8 h-8 flex-shrink-0">
                <div
                  class="w-8 h-8 rounded-lg border border-gray-700 cursor-pointer"
                  :style="{ background: lightColors[key] }"
                />
                <input
                  type="color"
                  :value="toInputColor(lightColors[key])"
                  class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  @input="(e) => { lightColors[key] = (e.target as HTMLInputElement).value }"
                />
              </div>
              <span class="flex-1 text-sm text-gray-300">{{ label }}</span>
              <input
                :value="lightColors[key]"
                class="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500"
                @input="(e) => { lightColors[key] = (e.target as HTMLInputElement).value }"
              />
            </div>
          </div>
        </div>

        <!-- Section: Dark overrides (Basic only) -->
        <template v-if="activePresetObj?.adaptiveMode">

          <!-- Default color mode selector -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <UIcon name="i-heroicons-computer-desktop" class="w-4 h-4 text-blue-400" />
              <h3 class="text-sm font-semibold text-white">Modo de cor padrão</h3>
            </div>
            <div class="flex gap-2 p-4">
              <button
                v-for="opt in COLOR_MODE_OPTS"
                :key="opt.value"
                class="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all"
                :class="defaultColorMode === opt.value
                  ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'"
                @click="defaultColorMode = opt.value as any"
              >
                <UIcon :name="opt.icon" class="w-5 h-5" />
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Dark color overrides -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <UIcon name="i-heroicons-moon" class="w-4 h-4 text-blue-400" />
              <h3 class="text-sm font-semibold text-white">Overrides — modo escuro</h3>
              <span class="text-[11px] text-gray-500 ml-auto">Ativa os que mudam no escuro</span>
            </div>
            <div class="divide-y divide-gray-800/60">
              <div
                v-for="{ key, label } in COLOR_VARS"
                :key="`dark-${key}`"
                class="flex items-center gap-3 px-4 py-2.5"
                :class="!darkOverrides[key]?.enabled && 'opacity-40'"
              >
                <!-- Toggle -->
                <input
                  type="checkbox"
                  class="accent-primary-500 w-4 h-4 cursor-pointer flex-shrink-0"
                  :checked="darkOverrides[key]?.enabled"
                  @change="(e) => { if (darkOverrides[key]) darkOverrides[key].enabled = (e.target as HTMLInputElement).checked }"
                />
                <!-- Color picker (disabled when not enabled) -->
                <div class="relative w-8 h-8 flex-shrink-0">
                  <div
                    class="w-8 h-8 rounded-lg border border-gray-700"
                    :class="darkOverrides[key]?.enabled ? 'cursor-pointer' : 'cursor-not-allowed'"
                    :style="{ background: darkOverrides[key]?.value ?? lightColors[key] }"
                  />
                  <input
                    v-if="darkOverrides[key]?.enabled"
                    type="color"
                    :value="toInputColor(darkOverrides[key]?.value ?? '#000000')"
                    class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    @input="(e) => { if (darkOverrides[key]) darkOverrides[key].value = (e.target as HTMLInputElement).value }"
                  />
                </div>
                <span class="flex-1 text-sm text-gray-300">{{ label }}</span>
                <input
                  :value="darkOverrides[key]?.value ?? ''"
                  :disabled="!darkOverrides[key]?.enabled"
                  class="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500 disabled:cursor-not-allowed"
                  @input="(e) => { if (darkOverrides[key]) darkOverrides[key].value = (e.target as HTMLInputElement).value }"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Section: Typography -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <UIcon name="i-heroicons-language" class="w-4 h-4 text-purple-400" />
            <h3 class="text-sm font-semibold text-white">Tipografia</h3>
          </div>
          <div class="divide-y divide-gray-800/60">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Fonte sem serifa</span>
              <input
                v-model="fontSans"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500"
                placeholder="'Inter', system-ui, sans-serif"
              />
            </div>
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Fonte com serifa</span>
              <input
                v-model="fontSerif"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500"
                placeholder="'Merriweather', serif"
              />
            </div>
          </div>
        </div>

        <!-- Section: Shape & Layout -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4 text-green-400" />
            <h3 class="text-sm font-semibold text-white">Formas e medidas</h3>
          </div>
          <div class="divide-y divide-gray-800/60">
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Raio botão</span>
              <input v-model="radiusBotao" class="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500" placeholder="12px" />
            </div>
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Raio cartão</span>
              <input v-model="radiusCartao" class="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500" placeholder="24px" />
            </div>
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Largura máx. site</span>
              <input v-model="maxWidthSite" class="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500" placeholder="1440px" />
            </div>
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Largura máx. conteúdo</span>
              <input v-model="maxWidthContent" class="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500" placeholder="1200px" />
            </div>
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-36 text-sm text-gray-300 flex-shrink-0">Largura máx. texto</span>
              <input v-model="maxWidthCopy" class="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-primary-500" placeholder="800px" />
            </div>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>
