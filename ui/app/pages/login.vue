<script setup lang="ts">
definePageMeta({ layout: "default" })

const { login } = useAuth()
const toast = useToast()

const form = reactive({ site: "", username: "", password: "" })
const loading = ref(false)

async function handleLogin() {
  loading.value = true
  try {
    const res = await login(form.site, form.username, form.password)
    if (res.success) {
      toast.add({ title: "Bem-vindo!", color: "success" })
      await navigateTo(`/${form.site}`)
    } else {
      toast.add({ title: res.error || "Erro ao entrar.", color: "error" })
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.error || "Falha na comunicação.", color: "error" })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 flex items-center justify-center p-4">
    <UCard class="w-full max-w-sm bg-gray-900 border-gray-800">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500/10 border border-primary-500/20 mb-4">
          <UIcon name="i-heroicons-star" class="w-7 h-7 text-primary-400" />
        </div>
        <h1 class="text-xl font-black text-white uppercase tracking-widest">Sirius CMS</h1>
        <p class="text-xs text-gray-500 mt-1 uppercase tracking-widest">Gestão de Conteúdo</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <UFormField label="Site" required>
          <UInput
            v-model="form.site"
            placeholder="ex: meu-site"
            icon="i-heroicons-globe-alt"
            class="w-full"
            autocomplete="off"
          />
        </UFormField>

        <UFormField label="Utilizador" required>
          <UInput
            v-model="form.username"
            placeholder="admin"
            icon="i-heroicons-user"
            class="w-full"
            autocomplete="username"
          />
        </UFormField>

        <UFormField label="Senha" required>
          <UInput
            v-model="form.password"
            type="password"
            placeholder="••••••••"
            icon="i-heroicons-lock-closed"
            class="w-full"
            autocomplete="current-password"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="loading"
          class="mt-2"
        >
          Entrar
        </UButton>
      </form>
    </UCard>
  </div>
</template>
