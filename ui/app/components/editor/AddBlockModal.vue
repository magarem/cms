<script setup lang="ts">
import { blockComponents } from '~/composables/useComponentSchema'

const emit = defineEmits<{ add: [componentName: string] }>()
const open = ref(false)
const custom = ref("")

function pick(name: string) {
  emit("add", name)
  open.value = false
  custom.value = ""
}

function pickCustom() {
  if (custom.value.trim()) pick(custom.value.trim())
}
</script>

<template>
  <div>
    <UButton
      icon="i-heroicons-plus"
      variant="dashed"
      color="neutral"
      block
      class="text-gray-500 hover:text-white"
      @click="open = true"
    >
      Adicionar Bloco
    </UButton>

    <UModal v-model:open="open" title="Escolher Componente">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="c in blockComponents"
              :key="c.name"
              class="flex items-center gap-2.5 p-3 rounded-lg border border-gray-800 bg-gray-900 hover:border-primary-500/50 hover:bg-primary-500/5 transition-colors text-left"
              :title="c.description"
              @click="pick(c.name)"
            >
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-white">{{ c.name }}</div>
                <div class="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{{ c.description }}</div>
              </div>
            </button>
          </div>

          <div class="border-t border-gray-800 pt-3">
            <p class="text-xs text-gray-500 mb-2">Componente personalizado:</p>
            <div class="flex gap-2">
              <UInput v-model="custom" placeholder="ComponentName" class="flex-1" @keyup.enter="pickCustom" />
              <UButton @click="pickCustom" :disabled="!custom.trim()">Adicionar</UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
