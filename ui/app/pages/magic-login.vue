<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const api   = useApi()

const token  = route.query.t  as string | undefined
const site   = route.query.site as string | undefined

onMounted(async () => {
  if (!token || !site) {
    await navigateTo("/login")
    return
  }
  try {
    const res = await api.post<{ success: boolean; site?: string; error?: string }>(
      "/auth/cms-magic",
      { token }
    )
    if (res.success && res.site) {
      await navigateTo(`/${res.site}`)
    } else {
      await navigateTo("/login")
    }
  } catch {
    await navigateTo("/login")
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-950">
    <div class="flex items-center gap-3 text-gray-400">
      <svg class="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <span class="text-sm">A entrar…</span>
    </div>
  </div>
</template>
