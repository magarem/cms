<script setup lang="ts">
const emit = defineEmits<{ select: [value: string] }>()

const site = inject<Ref<string>>("editorSite", ref(""))
const contentPath = inject<Ref<string>>("editorContentPath", ref(""))

const config = useRuntimeConfig()
const api = useApi()
const apiBase = config.public.apiBase as string

const open = ref(false)
const browsePath = ref("")
const items = ref<any[]>([])
const pending = ref(false)
const uploading = ref(false)
const uploadError = ref("")
const fileInputRef = ref<HTMLInputElement | null>(null)

// Reset to page dir whenever popover opens
watch(open, (v) => {
  if (v) {
    browsePath.value = contentPath.value
    uploadError.value = ""
    fetchItems()
  }
})

watch(browsePath, fetchItems)

async function fetchItems() {
  if (!site.value) return
  pending.value = true
  try {
    const res = await api.get<{ items: any[] }>(
      `/sites/${site.value}/media?path=${encodeURIComponent(browsePath.value)}`
    )
    items.value = res.items || []
  } catch {
    items.value = []
  } finally {
    pending.value = false
  }
}

function navigateTo(path: string) { browsePath.value = path }
function navigateUp() {
  const parts = browsePath.value.split("/")
  browsePath.value = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
}

const breadcrumbs = computed(() => {
  if (!browsePath.value) return []
  return browsePath.value.split("/").map((part, i, arr) => ({
    label: part,
    path: arr.slice(0, i + 1).join("/"),
  }))
})

function selectFile(item: any) {
  emit("select", item.name)
  open.value = false
}

function thumbUrl(item: any) {
  return `${apiBase}/sites/${site.value}/media/serve?path=${encodeURIComponent(item.path)}`
}

function fileIcon(item: any) {
  if (item.isVideo) return "i-heroicons-film"
  if (item.isAudio) return "i-heroicons-musical-note"
  return "i-heroicons-document"
}

function triggerUpload() {
  uploadError.value = ""
  fileInputRef.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !site.value) return

  uploading.value = true
  uploadError.value = ""
  try {
    const form = new FormData()
    form.append("file", file)
    form.append("path", browsePath.value)

    const res = await fetch(`${apiBase}/sites/${site.value}/media/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || "Erro ao fazer upload")
    }

    const { name } = await res.json()
    await fetchItems()
    emit("select", name)
    open.value = false
  } catch (e: any) {
    uploadError.value = e.message || "Erro ao fazer upload"
  } finally {
    uploading.value = false
    input.value = ""
  }
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-72 p-0 overflow-hidden' }">
    <UButton
      icon="i-heroicons-photo"
      size="xs"
      variant="ghost"
      color="neutral"
      title="Escolher média"
    />

    <template #content>
      <div class="flex flex-col" style="max-height: 360px">
        <!-- Breadcrumb nav + upload button -->
        <div class="flex items-center gap-1 px-2 py-1.5 border-b border-gray-800 bg-gray-900 flex-shrink-0 flex-wrap text-[11px]">
          <button class="text-gray-400 hover:text-white px-1 rounded" @click="navigateTo('')">raiz</button>
          <template v-for="crumb in breadcrumbs" :key="crumb.path">
            <span class="text-gray-700">/</span>
            <button class="text-gray-400 hover:text-white px-1 rounded" @click="navigateTo(crumb.path)">
              {{ crumb.label }}
            </button>
          </template>
          <div class="ml-auto flex-shrink-0">
            <button
              class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors disabled:opacity-40"
              :disabled="uploading"
              @click="triggerUpload"
            >
              <UIcon :name="uploading ? 'i-heroicons-arrow-path' : 'i-heroicons-arrow-up-tray'" :class="['w-3 h-3', uploading && 'animate-spin']" />
              {{ uploading ? 'A enviar…' : 'Upload' }}
            </button>
          </div>
        </div>

        <!-- Upload error -->
        <div v-if="uploadError" class="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-[10px] text-red-400 flex items-center gap-1.5">
          <UIcon name="i-heroicons-exclamation-circle" class="w-3 h-3 flex-shrink-0" />
          {{ uploadError }}
        </div>

        <!-- Grid -->
        <div class="overflow-y-auto p-2 flex-1">
          <div v-if="pending" class="flex justify-center py-6">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-gray-500" />
          </div>

          <div v-else class="grid grid-cols-4 gap-1.5">
            <!-- Up -->
            <button
              v-if="browsePath"
              class="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white aspect-square justify-center"
              @click="navigateUp"
            >
              <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
              <span class="text-[9px]">..</span>
            </button>

            <!-- Folders -->
            <button
              v-for="item in items.filter(i => i.type === 'folder')"
              :key="item.path"
              class="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-gray-800 aspect-square justify-center"
              @click="navigateTo(item.path)"
            >
              <UIcon name="i-heroicons-folder" class="w-6 h-6 text-yellow-500/70" />
              <span class="text-[9px] text-gray-400 truncate w-full text-center">{{ item.name }}</span>
            </button>

            <!-- Files -->
            <button
              v-for="item in items.filter(i => i.type === 'file')"
              :key="item.path"
              class="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-primary-500/20 hover:ring-1 hover:ring-primary-500 aspect-square justify-center transition-all group"
              @click="selectFile(item)"
            >
              <div class="w-full flex-1 rounded overflow-hidden bg-gray-800 flex items-center justify-center min-h-0">
                <img
                  v-if="item.isImage"
                  :src="thumbUrl(item)"
                  :alt="item.name"
                  class="w-full h-full object-cover"
                />
                <UIcon v-else :name="fileIcon(item)" class="w-5 h-5 text-gray-500" />
              </div>
              <span class="text-[9px] text-gray-400 group-hover:text-white truncate w-full text-center leading-tight">{{ item.name }}</span>
            </button>

            <!-- Empty drop hint -->
            <button
              v-if="!items.length && !pending"
              class="col-span-4 flex flex-col items-center gap-2 py-6 text-gray-700 hover:text-primary-400 transition-colors cursor-pointer rounded-lg hover:bg-primary-500/5"
              @click="triggerUpload"
            >
              <UIcon name="i-heroicons-arrow-up-tray" class="w-6 h-6" />
              <span class="text-xs">Sem ficheiros — clica para fazer upload</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.svg"
        class="hidden"
        @change="handleFileSelected"
      />
    </template>
  </UPopover>
</template>
