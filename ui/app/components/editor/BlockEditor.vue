<script setup lang="ts">
import { VueDraggable } from "vue-draggable-plus"
import { buildDefaultProps } from '~/composables/useComponentSchema'

interface Block {
  id?: string
  componentName: string
  isHero?: boolean
  props?: Record<string, any>
}

const props = defineProps<{
  modelValue: Block[] | null | undefined
  site: string
  contentPath: string
}>()
const emit = defineEmits<{ "update:modelValue": [v: Block[]] }>()

provide("editorSite", toRef(props, "site"))
provide("editorContentPath", toRef(props, "contentPath"))

const isAdmin = inject<ComputedRef<boolean>>("cmsIsAdmin", computed(() => false))

const blocks = computed({
  get: () => props.modelValue || [],
  set: (v) => emit("update:modelValue", v),
})

function updateBlock(i: number, block: Block) {
  const updated = [...blocks.value]
  updated[i] = block
  blocks.value = updated
}

function removeBlock(i: number) {
  const updated = [...blocks.value]
  updated.splice(i, 1)
  blocks.value = updated
}

function addBlock(componentName: string) {
  blocks.value = [
    ...blocks.value,
    {
      id: componentName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36),
      componentName,
      isHero: false,
      props: buildDefaultProps(componentName),
    },
  ]
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
      <p class="text-xs uppercase tracking-widest text-gray-500">Blocos ({{ blocks.length }})</p>
      <AddBlockModal v-if="isAdmin" @add="addBlock" />
    </div>

    <!-- Block list -->
    <div class="flex-1 overflow-y-auto p-3" data-blocks-scroll>
      <VueDraggable
        v-model="blocks"
        handle=".drag-handle"
        :animation="150"
        :disabled="!isAdmin"
        class="space-y-2"
      >
        <BlockCard
          v-for="(block, i) in blocks"
          :key="block.id || i"
          :block="block"
          :index="i"
          :site="site"
          :content-path="contentPath"
          :can-manage="isAdmin"
          @update:block="updateBlock(i, $event)"
          @remove="removeBlock(i)"
        />
      </VueDraggable>

      <div v-if="!blocks.length" class="text-center py-16 text-gray-600 text-sm">
        <UIcon name="i-heroicons-squares-2x2" class="w-8 h-8 mx-auto mb-3 opacity-30" />
        Nenhum bloco ainda
      </div>
    </div>
  </div>
</template>
