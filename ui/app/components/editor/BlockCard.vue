<script setup lang="ts">
import { getSchema } from '~/composables/useComponentSchema'

interface Block {
  id?: string
  componentName: string
  label?: string
  isHero?: boolean
  active?: boolean
  props?: Record<string, any>
}

const props = defineProps<{
  block: Block
  index: number
  site?: string
  contentPath?: string
  canManage?: boolean
}>()

const emit = defineEmits<{
  "update:block": [b: Block]
  remove: []
}>()

const expanded = ref(props.block.componentName === "ContentMD")

// ── Inline label editing ──────────────────────────────────────
const editingLabel = ref(false)
const localLabel = ref(props.block.label || '')
const labelInput = ref<HTMLInputElement | null>(null)

function startEditLabel() {
  localLabel.value = props.block.label || ''
  editingLabel.value = true
  nextTick(() => labelInput.value?.focus())
}

function saveLabel() {
  editingLabel.value = false
  const newLabel = localLabel.value.trim() || undefined
  if (newLabel !== props.block.label) {
    emit('update:block', { ...props.block, label: newLabel })
  }
}

function cancelLabel() {
  editingLabel.value = false
  localLabel.value = props.block.label || ''
}

function setIsHero(v: boolean) {
  emit("update:block", { ...props.block, isHero: v })
}

function setActive(v: boolean) {
  emit("update:block", { ...props.block, active: v })
}

function setProps(v: Record<string, any>) {
  emit("update:block", { ...props.block, props: v })
}

const localProps = computed({
  get: () => props.block.props || {},
  set: setProps,
})

const schemaDefs = computed(() => {
  const schema = getSchema(props.block.componentName)
  if (!schema?.props) return {}
  return Object.fromEntries(schema.props.map(p => [p.name, p]))
})

// ── ContentMD markdown file support ──────────────────────────
const api = useApi()

// True for any ContentMD block — filename may or may not exist yet
const isContentMD = computed(() => props.block.componentName === "ContentMD")

const mdContent = ref("")
const mdPending = ref(false)
const mdSaving = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

// ── Frontmatter parsing ──────────────────────────────────────
const IMAGE_KEY_RE = /image|photo|avatar|banner|logo|cover|thumbnail|slide/i

const frontmatter = ref<Record<string, any>>({})
const mdBodyText = ref("")

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const m = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/)
  if (!m) return { meta: {}, body: content }

  const meta: Record<string, any> = {}
  let currentKey: string | null = null
  let currentArr: string[] | null = null

  for (const line of m[1].split(/\r?\n/)) {
    const arrItem = line.match(/^[ \t]+-[ \t]*(.*)\s*$/)
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)[ \t]*:[ \t]*(.+)$/)
    const arrStart = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)[ \t]*:[ \t]*$/)

    if (arrItem && currentArr !== null) {
      currentArr.push(arrItem[1].replace(/^['"]|['"]$/g, "").trim())
    } else {
      if (currentArr !== null && currentKey) meta[currentKey] = currentArr
      currentArr = null
      if (kv) {
        currentKey = kv[1]
        const raw = kv[2].trim().replace(/^['"]|['"]$/g, "")
        if (raw === "true") meta[currentKey] = true
        else if (raw === "false") meta[currentKey] = false
        else if (/^-?\d+$/.test(raw)) meta[currentKey] = parseInt(raw)
        else if (/^-?\d+\.\d+$/.test(raw)) meta[currentKey] = parseFloat(raw)
        else meta[currentKey] = raw
      } else if (arrStart) {
        currentKey = arrStart[1]
        currentArr = []
      }
    }
  }
  if (currentArr !== null && currentKey) meta[currentKey] = currentArr
  return { meta, body: m[2] }
}

function serializeFrontmatter(meta: Record<string, any>, body: string): string {
  if (!Object.keys(meta).length) return body
  const lines = ["---"]
  for (const [key, val] of Object.entries(meta)) {
    if (Array.isArray(val)) {
      if (!val.length) continue
      lines.push(`${key}:`)
      val.forEach(item => lines.push(`  - ${item}`))
    } else {
      lines.push(`${key}: ${val}`)
    }
  }
  lines.push("---")
  return lines.join("\n") + "\n" + (body.startsWith("\n") ? body : "\n" + body)
}

function initFromContent(content: string) {
  const { meta, body } = parseFrontmatter(content)
  for (const key of Object.keys(meta)) {
    if (IMAGE_KEY_RE.test(key) && !Array.isArray(meta[key])) {
      meta[key] = meta[key] ? [String(meta[key])] : []
    }
  }
  frontmatter.value = meta
  mdBodyText.value = body
}

function rebuildMdContent() {
  mdContent.value = serializeFrontmatter(frontmatter.value, mdBodyText.value)
}

function updateFrontmatterField(key: string, value: any) {
  frontmatter.value = { ...frontmatter.value, [key]: value }
  rebuildMdContent()
}

function updateAllFrontmatter(v: Record<string, any>) {
  frontmatter.value = v
  rebuildMdContent()
}

watch(mdBodyText, rebuildMdContent)

// Load existing file content when fileName is set or changes.
// Guard: skip re-fetch when fileName was just auto-generated (oldFileName was undefined
// and we already have content in the editor — the file was just written by us).
watch(
  () => props.block.props?.fileName as string | undefined,
  async (fileName, oldFileName) => {
    if (!isContentMD.value || !fileName || !props.site || !props.contentPath) return
    if (!oldFileName && mdContent.value) return
    mdPending.value = true
    try {
      const res = await api.get<{ content: string }>(
        `/sites/${props.site}/markdown?path=${encodeURIComponent(`${props.contentPath}/${fileName}`)}`
      )
      mdContent.value = res.content
      initFromContent(res.content)
    } catch {
      mdContent.value = ""
      frontmatter.value = {}
      mdBodyText.value = ""
    } finally {
      mdPending.value = false
    }
  },
  { immediate: true }
)

// Save markdown file immediately (called by debounce and by Ctrl+S).
async function flushMdSave() {
  if (!isContentMD.value || !props.site || !props.contentPath) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  let fileName = props.block.props?.fileName as string | undefined
  const isNew = !fileName
  if (isNew) fileName = `md-${Date.now().toString(36)}.md`
  mdSaving.value = true
  try {
    await api.put(
      `/sites/${props.site}/markdown?path=${encodeURIComponent(`${props.contentPath}/${fileName}`)}`,
      { content: mdContent.value }
    )
    if (isNew) {
      emit("update:block", { ...props.block, props: { ...props.block.props, fileName } })
    }
  } finally {
    mdSaving.value = false
  }
}

watch(mdContent, () => {
  if (!isContentMD.value || !props.site || !props.contentPath) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushMdSave, 1200)
})

function onMdKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    flushMdSave()
  }
}

// ── Dynamic textarea height ───────────────────────────────
const cardRef         = ref<HTMLElement | null>(null)
const mdTextareaWrap  = ref<HTMLElement | null>(null)
const mdTextareaH     = ref(300)
let   resizeObserver: ResizeObserver | null = null

function recalcTextareaH() {
  if (!mdTextareaWrap.value || !cardRef.value) return
  const scrollEl = cardRef.value.closest('[data-blocks-scroll]') as HTMLElement | null
  if (!scrollEl) return
  const bottom = scrollEl.getBoundingClientRect().bottom
  const top    = mdTextareaWrap.value.getBoundingClientRect().top
  mdTextareaH.value = Math.max(bottom - top - 20, 120)
}

onMounted(() => {
  if (!isContentMD.value) return
  nextTick(recalcTextareaH)
  const scrollEl = cardRef.value?.closest('[data-blocks-scroll]') as HTMLElement | null
  if (!scrollEl) return
  resizeObserver = new ResizeObserver(() => nextTick(recalcTextareaH))
  resizeObserver.observe(scrollEl)
  resizeObserver.observe(cardRef.value!)
})

onUnmounted(() => resizeObserver?.disconnect())

watch(() => Object.keys(frontmatter.value).length, () => nextTick(recalcTextareaH))
watch(mdPending, () => nextTick(recalcTextareaH))
</script>

<template>
  <div
    ref="cardRef"
    class="border rounded-lg overflow-hidden border-gray-800 bg-gray-900"
  >
    <!-- Block header -->
    <div class="flex items-center gap-2 px-3 py-2.5 bg-gray-900">
      <div
        v-if="canManage"
        class="drag-handle cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400"
      >
        <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
      </div>

      <div class="flex-1 min-w-0 cursor-pointer select-none" @click="expanded = !expanded">
        <template v-if="block.label">
          <div class="text-sm font-semibold text-white leading-tight truncate">{{ block.label }}</div>
          <div class="text-[10px] text-gray-500 leading-tight">{{ block.componentName }}</div>
        </template>
        <template v-else>
          <span class="text-sm font-medium text-white">{{ block.componentName }}</span>
          <span v-if="block.id" class="text-[10px] font-mono text-gray-600 ml-2">#{{ block.id }}</span>
        </template>
      </div>

      <!-- Label editor -->
      <div class="flex items-center" @click.stop>
        <input
          v-if="editingLabel"
          ref="labelInput"
          v-model="localLabel"
          class="text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-0.5 w-36 focus:outline-none focus:border-primary-500"
          placeholder="rótulo do bloco..."
          @blur="saveLabel"
          @keydown.enter.prevent="saveLabel"
          @keydown.escape="cancelLabel"
        />
        <UButton
          v-else
          :icon="block.label ? 'i-heroicons-pencil-square' : 'i-heroicons-tag'"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="startEditLabel"
        />
      </div>

      <UTooltip :text="block.active === false ? 'Bloco inativo — clique para ativar' : 'Bloco ativo — clique para desativar'">
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide transition-colors"
          :class="block.active === false
            ? 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
            : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'"
          @click="setActive(block.active === false)"
        >
          <UIcon
            :name="block.active === false ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
            class="w-3 h-3"
          />
          {{ block.active === false ? 'Off' : 'On' }}
        </button>
      </UTooltip>

      <div class="flex items-center gap-1.5">
        <span class="text-[10px] text-gray-600 uppercase">Hero</span>
        <USwitch :model-value="block.isHero || false" size="xs" @update:model-value="setIsHero" />
      </div>

      <UButton
        :icon="expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="expanded = !expanded"
      />

      <UButton
        v-if="canManage"
        icon="i-heroicons-trash"
        size="xs"
        variant="ghost"
        color="error"
        @click="emit('remove')"
      />
    </div>

    <!-- Expanded form -->
    <div v-if="expanded" class="border-t border-gray-800 p-4 space-y-4">
      <!-- Regular props for non-ContentMD blocks -->
      <PropForm
        v-if="!isContentMD"
        :model-value="localProps"
        :schema-defs="schemaDefs"
        @update:model-value="setProps"
      />

      <!-- ContentMD: inline markdown editor -->
      <div v-if="isContentMD" class="space-y-2">
        <!-- <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5 text-gray-500" />
          <span class="text-[10px] font-mono text-gray-500">
            {{ block.props?.fileName || 'novo ficheiro (gerado ao guardar)' }}
          </span>
          <UIcon v-if="mdSaving" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-gray-600" />
          <span v-if="mdSaving" class="text-[10px] text-gray-600">a guardar...</span>
        </div> -->

        <div v-if="mdPending" class="flex justify-center py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-600" />
        </div>

        <div v-else class="space-y-4">
          <!-- Frontmatter fields -->
          <div v-if="Object.keys(frontmatter).length" class="space-y-2">
            <span class="text-[10px] font-mono text-gray-500 uppercase tracking-wide">Metadados</span>
            <PropForm :model-value="frontmatter" @update:model-value="updateAllFrontmatter" />
          </div>

          <!-- Markdown body -->
          <div ref="mdTextareaWrap" class="space-y-1">
            <!-- <span class="text-[10px] font-mono text-gray-500 uppercase tracking-wide">Conteúdo</span> -->
            <UTextarea
              v-model="mdBodyText"
              :style="{ height: mdTextareaH + 'px', resize: 'none' }"
              class="w-full font-mono text-sm overflow-y-auto"
              placeholder="Escreve o conteúdo markdown aqui..."
              @keydown="onMdKeyDown"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
