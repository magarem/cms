<script setup lang="ts">
defineProps<{ site: string }>()

const { user, logout } = useAuth()

const cmsPublish = inject<{
  publishing:       Readonly<Ref<boolean>>
  activeVersion:    ComputedRef<string>
  openPublishModal: () => void
}>("cmsPublish")
</script>

<template>
  <div class="h-14 flex-shrink-0 flex items-center gap-3 px-4 border-b border-gray-800 bg-gray-900">

    <!-- Breadcrumbs slot -->
    <div class="flex items-center gap-1.5 flex-1 min-w-0 text-sm">
      <slot name="breadcrumb" />
    </div>

    <!-- Actions slot -->
    <div class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>

    <!-- Publish button (admin only) -->
    <UButton
      v-if="user?.role === 'admin' && cmsPublish"
      icon="i-heroicons-rocket-launch"
      size="sm"
      color="success"
      variant="soft"
      :loading="cmsPublish.publishing.value"
      @click="cmsPublish.openPublishModal()"
    >
      Publicar
    </UButton>

    <!-- User -->
    <div class="flex items-center gap-2 shrink-0 pl-3 border-l border-gray-800">
      <div class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
        {{ user?.username?.[0]?.toUpperCase() }}
      </div>
      <div class="hidden sm:block leading-none min-w-0">
        <div class="text-xs font-medium text-white truncate max-w-28">{{ user?.username }}</div>
        <div class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">{{ user?.role }}</div>
      </div>
      <UButton
        icon="i-heroicons-arrow-right-on-rectangle"
        size="xs"
        color="neutral"
        variant="ghost"
        title="Sair"
        @click="logout"
      />
    </div>

  </div>
</template>
