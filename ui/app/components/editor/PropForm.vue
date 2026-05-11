<script setup lang="ts">
import type { PropSchema } from '~/composables/useComponentSchema'

const props = defineProps<{
  modelValue: Record<string, any>
  skipKeys?: string[]
  schemaDefs?: Record<string, PropSchema>
}>()
const emit = defineEmits<{ "update:modelValue": [v: Record<string, any>] }>()

function setKey(key: string, value: any) {
  emit("update:modelValue", { ...props.modelValue, [key]: value })
}

const keys = computed(() => {
  if (!props.modelValue || typeof props.modelValue !== "object") return []
  const skip = props.skipKeys || []
  return Object.keys(props.modelValue).filter((k) => !k.startsWith("_") && !skip.includes(k))
})
</script>

<template>
  <div class="space-y-3">
    <div v-for="key in keys" :key="key">
      <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{{ schemaDefs?.[key]?.label || key }}</label>
      <PropField
        :field-key="key"
        :model-value="modelValue[key]"
        :schema="schemaDefs?.[key]"
        @update:model-value="setKey(key, $event)"
      />
    </div>
    <div v-if="!keys.length" class="text-xs text-gray-600 italic">Sem propriedades</div>
  </div>
</template>
