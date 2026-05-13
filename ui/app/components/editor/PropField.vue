<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus"
import type { PropSchema } from '~/composables/useComponentSchema'

const props = defineProps<{ fieldKey: string; modelValue: any; schema?: PropSchema }>()
const emit = defineEmits<{ "update:modelValue": [v: any] }>()

const editorSite = inject<Ref<string>>("editorSite", ref(""))
const contentPath = inject<Ref<string>>("editorContentPath", ref(""))
const config = useRuntimeConfig()
const apiBase = config.public.apiBase as string

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i

function thumbSrc(value: string): string | null {
  if (!value || typeof value !== "string") return null
  if (value.startsWith("http") || value.startsWith("data:")) {
    return IMAGE_EXT.test(value) || value.startsWith("data:image") ? value : null
  }
  if (!editorSite.value) return null
  const clean = value.replace(/^\/+/, "")
  const fullPath = clean.includes("/") ? clean : contentPath.value ? `${contentPath.value}/${clean}` : clean
  if (!IMAGE_EXT.test(fullPath)) return null
  return `${apiBase}/sites/${editorSite.value}/media/serve?path=${encodeURIComponent(fullPath)}`
}

type FieldType =
  | "toggle" | "number" | "textarea" | "markdown" | "url" | "image"
  | "color" | "icon-text" | "text" | "select" | "date"
  | "string-array" | "media-array" | "object-array" | "object"

function infer(key: string, val: any): FieldType {
  if (val === null || val === undefined) return "text"
  if (typeof val === "boolean") return "toggle"
  if (typeof val === "number") return "number"
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] !== "string") return "object-array"
    if (/image|photo|avatar|banner|logo|slide|video|audio|media/i.test(key)) return "media-array"
    return "string-array"
  }
  if (typeof val === "object") return "object"
  if (/color/i.test(key)) return "color"
  if (/icon/i.test(key)) return "icon-text"
  if (/url|link|href|src|to$|path$/i.test(key)) return "url"
  if (/image|photo|avatar|banner|logo|slide/i.test(key)) return "image"
  if (/video|audio|media|file/i.test(key)) return "image"
  if (/markdown|content|body|text$/i.test(key)) return "markdown"
  if (typeof val === "string" && val.length > 80) return "textarea"
  return "text"
}

const SCHEMA_TYPE_MAP: Record<string, FieldType> = {
  text: "text", email: "text", path: "url",
  textarea: "textarea", markdown: "markdown",
  number: "number", boolean: "toggle",
  select: "select", url: "url",
  image: "image", video: "image", media: "image",
  "image-array": "media-array",
  array: "object-array",
  icon: "icon-text", date: "date", color: "color",
  object: "object",
}

const type = computed<FieldType>(() => {
  if (props.schema?.type) {
    const mapped = SCHEMA_TYPE_MAP[props.schema.type] ?? "text"
    // Schema says generic "text" — still run key-name inference so image/media fields keep their picker
    if (mapped === "text") return infer(props.fieldKey, props.modelValue)
    return mapped
  }
  return infer(props.fieldKey, props.modelValue)
})

const selectOptions = computed(() => props.schema?.options ?? [])

const showMediaPicker = computed(() =>
  !!editorSite.value && type.value === "image"
)

const local = computed({
  get: () => type.value === 'toggle' ? Boolean(props.modelValue ?? false) : props.modelValue,
  set: (v) => emit("update:modelValue", v),
})

// Normalise scalar → array for media-array / string-array fields so that
// existing YAML entries like  image: "path.jpg"  render correctly.
const arrayValue = computed<string[]>(() => {
  const v = props.modelValue
  if (Array.isArray(v)) return v
  if (v && typeof v === "string") return [v]
  return []
})

// Writable computed for VueDraggable — reorder emits the full new array up.
const draggableArray = computed<string[]>({
  get: () => arrayValue.value,
  set: (v) => emit("update:modelValue", v),
})

// String array helpers
function addStringItem() {
  emit("update:modelValue", [...arrayValue.value, ""])
}
function removeStringItem(i: number) {
  const arr = [...arrayValue.value]
  arr.splice(i, 1)
  emit("update:modelValue", arr)
}
function updateStringItem(i: number, val: string) {
  const arr = [...arrayValue.value]
  arr[i] = val
  emit("update:modelValue", arr)
}

// Object array helpers
function addObjectItem() {
  let newItem: any = {}
  if (props.schema?.itemSchema?.length) {
    for (const field of props.schema.itemSchema) {
      newItem[field.name] = field.default !== undefined ? field.default
        : field.type === "boolean" ? false
        : field.type === "number" ? 0
        : ""
    }
  } else if (props.modelValue?.length) {
    const template = JSON.parse(JSON.stringify(props.modelValue[0]))
    function clearObj(o: any): any {
      if (typeof o !== "object" || o === null) return typeof o === "boolean" ? false : typeof o === "number" ? 0 : ""
      if (Array.isArray(o)) return []
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clearObj(v)]))
    }
    newItem = clearObj(template)
  }
  emit("update:modelValue", [...(props.modelValue || []), newItem])
}

const itemSchemaDefs = computed(() => {
  if (!props.schema?.itemSchema?.length) return undefined
  return Object.fromEntries(props.schema.itemSchema.map(s => [s.name, s]))
})
function removeObjectItem(i: number) {
  const arr = [...props.modelValue]
  arr.splice(i, 1)
  emit("update:modelValue", arr)
}
function updateObjectItem(i: number, val: any) {
  const arr = [...props.modelValue]
  arr[i] = val
  emit("update:modelValue", arr)
}

// Writable computed for object-array VueDraggable reorder
const draggableObjectArray = computed({
  get: () => (props.modelValue as any[]) || [],
  set: (v) => {
    objectItemsExpanded.value = {}
    emit("update:modelValue", v)
  },
})

const objectItemsExpanded = ref<Record<number, boolean>>({})

const zoomSrc = ref<string | null>(null)

function openZoom(src: string) { zoomSrc.value = src }
function closeZoom() { zoomSrc.value = null }

onMounted(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeZoom() }
  window.addEventListener("keydown", onKey)
  onUnmounted(() => window.removeEventListener("keydown", onKey))
})
</script>

<template>
  <!-- Toggle -->
  <USwitch v-if="type === 'toggle'" v-model="local" />

  <!-- Number -->
  <UInput v-else-if="type === 'number'" v-model.number="local" type="number" class="w-full" />

  <!-- Color -->
  <div v-else-if="type === 'color'" class="flex items-center gap-2">
    <input type="color" :value="local || '#000000'" class="h-8 w-10 rounded cursor-pointer border border-gray-700 bg-transparent" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
    <UInput v-model="local" placeholder="#000000" class="flex-1" />
  </div>

  <!-- Select -->
  <USelect
    v-else-if="type === 'select'"
    v-model="local"
    :items="selectOptions"
    value-key="value"
    label-key="label"
    class="w-full"
  />

  <!-- Date -->
  <UInput v-else-if="type === 'date'" v-model="local" type="date" class="w-full" />

  <!-- Textarea / Markdown -->
  <UTextarea
    v-else-if="type === 'textarea' || type === 'markdown'"
    v-model="local"
    :rows="type === 'markdown' ? 10 : 3"
    :class="type === 'markdown' ? 'font-mono text-xs max-h-[400px] overflow-y-auto' : ''"
    class="w-full"
  />

  <!-- Media array — string paths, each with a gallery picker + drag reorder -->
  <div v-else-if="type === 'media-array'" class="space-y-2">
    <VueDraggable v-model="draggableArray" handle=".media-drag-handle" :animation="150" :group="schema?.group ?? undefined" :class="['space-y-2', schema?.group && draggableArray.length === 0 ? 'min-h-[40px] border border-dashed border-gray-700 rounded-lg' : '']">
      <span v-if="schema?.group && draggableArray.length === 0" class="flex items-center justify-center h-10 text-[10px] text-gray-600 uppercase tracking-wider pointer-events-none select-none">
        Arraste aqui
      </span>
      <div v-for="(item, i) in draggableArray" :key="i" class="flex items-center gap-2">
        <div class="media-drag-handle cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 flex-shrink-0">
          <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
        </div>
        <button
          v-if="thumbSrc(item)"
          class="w-8 h-8 rounded overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-primary-500 transition-all"
          @click="openZoom(thumbSrc(item)!)"
        >
          <img :src="thumbSrc(item)!" class="w-full h-full object-cover" @error="($event.target as HTMLImageElement).parentElement!.style.display='none'" />
        </button>
        <UInput
          :model-value="item"
          class="flex-1"
          placeholder="caminho ou URL..."
          @update:model-value="updateStringItem(i, $event)"
        />
        <MediaPicker v-if="editorSite" @select="updateStringItem(i, $event)" />
        <UButton icon="i-heroicons-trash" size="xs" color="error" variant="ghost" @click="removeStringItem(i)" />
      </div>
    </VueDraggable>
    <UButton icon="i-heroicons-plus" size="xs" variant="ghost" color="neutral" @click="addStringItem">
      Adicionar
    </UButton>
  </div>

  <!-- String array -->
  <div v-else-if="type === 'string-array'" class="space-y-2">
    <VueDraggable v-model="draggableArray" handle=".str-drag-handle" :animation="150" class="space-y-2">
      <div v-for="(item, i) in draggableArray" :key="i" class="flex items-center gap-2">
        <div class="str-drag-handle cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 flex-shrink-0">
          <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
        </div>
        <UInput
          :model-value="item"
          class="flex-1"
          @update:model-value="updateStringItem(i, $event)"
        />
        <UButton icon="i-heroicons-trash" size="xs" color="error" variant="ghost" @click="removeStringItem(i)" />
      </div>
    </VueDraggable>
    <UButton icon="i-heroicons-plus" size="xs" variant="ghost" color="neutral" @click="addStringItem">
      Adicionar
    </UButton>
  </div>

  <!-- Object array -->
  <div v-else-if="type === 'object-array'" class="space-y-2">
    <VueDraggable v-model="draggableObjectArray" handle=".obj-drag-handle" :animation="150" class="space-y-2">
      <div v-for="(item, i) in draggableObjectArray" :key="i" class="border border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 text-xs text-gray-400"
          @click="objectItemsExpanded[i] = !objectItemsExpanded[i]"
        >
          <div class="obj-drag-handle cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 flex-shrink-0" @click.stop>
            <UIcon name="i-heroicons-bars-2" class="w-4 h-4" />
          </div>
          <span class="flex-1 text-left">Item {{ i + 1 }}</span>
          <UIcon :name="objectItemsExpanded[i] ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3 h-3" />
          <UButton
            icon="i-heroicons-trash"
            size="xs"
            color="error"
            variant="ghost"
            @click.stop="removeObjectItem(i)"
          />
        </button>
        <div v-if="objectItemsExpanded[i]" class="p-3 bg-gray-900">
          <PropForm :model-value="item" :schema-defs="itemSchemaDefs" @update:model-value="updateObjectItem(i, $event)" />
        </div>
      </div>
    </VueDraggable>
    <UButton icon="i-heroicons-plus" size="xs" variant="ghost" color="neutral" @click="addObjectItem">
      Adicionar item
    </UButton>
  </div>

  <!-- Nested object -->
  <div v-else-if="type === 'object'" class="border border-gray-800 rounded-lg p-3 bg-gray-900/50 space-y-3">
    <PropForm :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
  </div>

  <!-- Default: text / url / image / icon -->
  <div v-else class="flex items-center gap-1">
    <button
      v-if="type === 'image' && thumbSrc(local)"
      class="w-8 h-8 rounded overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-primary-500 transition-all"
      @click="openZoom(thumbSrc(local)!)"
    >
      <img :src="thumbSrc(local)!" class="w-full h-full object-cover" @error="($event.target as HTMLImageElement).parentElement!.style.display='none'" />
    </button>
    <UInput v-model="local" class="flex-1" :placeholder="type === 'image' ? 'caminho ou URL...' : ''" />
    <MediaPicker v-if="showMediaPicker" @select="local = $event" />
  </div>

  <!-- Image zoom modal -->
  <Teleport to="body">
    <Transition name="zoom-modal">
      <div
        v-if="zoomSrc"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click.self="closeZoom"
      >
        <div class="relative max-w-[90vw] max-h-[90vh]">
          <img
            :src="zoomSrc"
            class="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
          />
          <button
            class="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors shadow-lg"
            @click="closeZoom"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.zoom-modal-enter-active, .zoom-modal-leave-active {
  transition: opacity 0.2s ease;
}
.zoom-modal-enter-active .relative, .zoom-modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.zoom-modal-enter-from, .zoom-modal-leave-to {
  opacity: 0;
}
.zoom-modal-enter-from .relative {
  transform: scale(0.9);
  opacity: 0;
}
.zoom-modal-leave-to .relative {
  transform: scale(0.9);
  opacity: 0;
}
</style>
