<script setup lang="ts">
interface TreeNode {
  title: string
  slug: string
  type: "page" | "folder"
  children?: TreeNode[]
}

const props = defineProps<{ nodes: TreeNode[]; site: string; depth?: number }>()

const expanded = ref<Record<string, boolean>>({})

function toggle(slug: string) {
  expanded.value[slug] = !expanded.value[slug]
}

function editorUrl(node: TreeNode) {
  return `/${props.site}/pages/${node.slug}`
}
</script>

<template>
  <div :class="depth ? 'ml-4 border-l border-gray-800 pl-2' : ''">
    <div v-for="node in nodes" :key="node.slug" class="mb-0.5">
      <div class="flex items-center group">
        <!-- folder toggle -->
        <button
          v-if="node.type === 'folder'"
          class="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-400 flex-shrink-0"
          @click="toggle(node.slug)"
        >
          <UIcon
            :name="expanded[node.slug] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-3 h-3"
          />
        </button>
        <div v-else class="w-5 flex-shrink-0" />

        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <UIcon
            :name="node.type === 'folder' ? 'i-heroicons-folder' : 'i-heroicons-document-text'"
            class="w-3.5 h-3.5 flex-shrink-0"
            :class="node.type === 'folder' ? 'text-yellow-500' : 'text-gray-500'"
          />
          <NuxtLink
            v-if="node.type === 'page'"
            :to="editorUrl(node)"
            class="text-sm text-gray-300 hover:text-white truncate transition-colors py-1"
          >
            {{ node.title }}
          </NuxtLink>
          <button
            v-else
            class="text-sm text-gray-300 hover:text-white truncate text-left py-1 w-full"
            @click="toggle(node.slug)"
          >
            {{ node.title }}
          </button>
        </div>

        <NuxtLink
          v-if="node.type === 'page'"
          :to="editorUrl(node)"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5 text-gray-500 hover:text-primary-400" />
        </NuxtLink>
      </div>

      <!-- children -->
      <div v-if="node.type === 'folder' && expanded[node.slug] && node.children?.length">
        <PageTree :nodes="node.children" :site="site" :depth="(depth || 0) + 1" />
      </div>
    </div>

    <div v-if="!nodes.length && !depth" class="text-xs text-gray-600 py-2 px-5">
      Nenhuma página encontrada
    </div>
  </div>
</template>
