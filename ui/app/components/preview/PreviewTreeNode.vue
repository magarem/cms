<script setup lang="ts">
const props = defineProps<{
  node: any
  selectedPath: string
  depth?: number
}>()

const emit = defineEmits<{ select: [node: any] }>()

const d = computed(() => props.depth || 0)

function href(node: any): string {
  const slug = node.slug || node.name || ""
  return slug.startsWith("/") ? slug : `/${slug}`
}

const isSelected = computed(() => props.selectedPath === href(props.node))

const icon = computed(() => {
  if (props.node.type === "collection") return "i-heroicons-rectangle-stack"
  if (props.node.children?.length) return "i-heroicons-folder"
  return "i-heroicons-document-text"
})

const open = ref(true)
const hasChildren = computed(() => (props.node.children || []).length > 0)
</script>

<template>
  <div>
    <!-- Node row -->
    <button
      class="w-full text-left flex items-center gap-1.5 py-1.5 rounded-md text-xs transition-colors"
      :style="{ paddingLeft: `${(d + 1) * 10 + 4}px` }"
      :class="isSelected
        ? 'bg-primary-500/20 text-primary-400'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'"
      @click="emit('select', node)"
    >
      <!-- Expand toggle (if has children) -->
      <button
        v-if="hasChildren"
        class="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
        @click.stop="open = !open"
      >
        <UIcon
          :name="open ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="w-3 h-3"
        />
      </button>
      <span v-else class="flex-shrink-0 w-3.5" />

      <UIcon :name="icon" class="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
      <span class="truncate flex-1">{{ node.title || node.name }}</span>
    </button>

    <!-- Children -->
    <template v-if="hasChildren && open">
      <PreviewTreeNode
        v-for="child in node.children"
        :key="child.slug"
        :node="child"
        :selected-path="selectedPath"
        :depth="d + 1"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>
