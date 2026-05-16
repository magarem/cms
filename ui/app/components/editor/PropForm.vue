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
  const skip = props.skipKeys || []
  const objKeys = (props.modelValue && typeof props.modelValue === "object")
    ? Object.keys(props.modelValue).filter((k) => !k.startsWith("_"))
    : []
  const schemaKeys = props.schemaDefs ? Object.keys(props.schemaDefs) : []
  return [...new Set([...schemaKeys, ...objKeys])].filter((k) => !skip.includes(k))
})

const WIDE_SCHEMA_TYPES = new Set(['textarea', 'markdown', 'array', 'image-array', 'object'])

function isWide(key: string): boolean {
  const schema = props.schemaDefs?.[key]
  if (schema?.type) return WIDE_SCHEMA_TYPES.has(schema.type)
  // No schema — infer from value
  const val = props.modelValue?.[key]
  if (Array.isArray(val)) return true
  if (val !== null && typeof val === 'object') return true
  if (typeof val === 'string' && val.length > 80) return true
  return false
}
</script>

<template>
  <div class="grid grid-cols-2 gap-x-3 gap-y-3">
    <div v-for="key in keys" :key="key" :class="isWide(key) ? 'col-span-2' : ''">
      <label class="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{{ schemaDefs?.[key]?.label || key }}</label>
      <PropField
        :field-key="key"
        :model-value="modelValue[key]"
        :schema="schemaDefs?.[key]"
        @update:model-value="setKey(key, $event)"
      />
    </div>
    <div v-if="!keys.length" class="col-span-2 text-xs text-gray-600 italic">Sem propriedades</div>
  </div>
</template>
