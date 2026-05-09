<script setup lang="ts">
const { user, ready } = useAuth()

watchEffect(() => {
  if (ready.value && user.value) {
    navigateTo(`/${user.value.site}`)
  } else if (ready.value && !user.value) {
    navigateTo("/login")
  }
})
</script>

<template>
  <div class="h-screen flex items-center justify-center bg-gray-950">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-500 animate-spin" />
  </div>
</template>
