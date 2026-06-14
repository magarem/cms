<script setup lang="ts">
const { user, logout } = useAuth()
const route = useRoute()

const navItems = [
  { label: "Sites",    icon: "i-heroicons-globe-alt",       to: `/${user.value?.site || 'login'}`, prefix: null },
  { label: "Clientes", icon: "i-heroicons-building-office", to: "/clients",                         prefix: "/clients" },
  { label: "Produtos", icon: "i-heroicons-cube",            to: "/products",                        prefix: "/products" },
]

function isActive(item: typeof navItems[0]) {
  if (item.prefix) return route.path.startsWith(item.prefix)
  return !route.path.startsWith("/clients") && !route.path.startsWith("/products")
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
    <!-- Top bar -->
    <header class="flex-shrink-0 h-12 border-b border-gray-800 bg-gray-900 flex items-center px-4 gap-4">
      <NuxtLink to="/" class="flex items-center gap-2 mr-4">
        <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
          <svg viewBox="0 0 20 20" class="w-3 h-3" fill="none">
            <path d="M10 2 L11.5 8.5 L18 10 L11.5 11.5 L10 18 L8.5 11.5 L2 10 L8.5 8.5 Z" fill="white" />
          </svg>
        </div>
        <span class="text-xs font-black tracking-[0.18em] uppercase text-white">Sirius</span>
        <span class="text-[8px] font-semibold tracking-[0.25em] uppercase text-primary-400/70">CMS</span>
      </NuxtLink>

      <nav class="flex items-center gap-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
          :class="isActive(item)
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'"
        >
          <UIcon :name="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-gray-500">{{ user?.username }}</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-arrow-right-on-rectangle" @click="logout" />
      </div>
    </header>

    <div class="flex-1 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
