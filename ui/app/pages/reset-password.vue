<script setup lang="ts">
definePageMeta({ layout: "default" })

const route = useRoute()
const api   = useApi()
const toast = useToast()

const token    = computed(() => route.query.token as string || "")
const password = ref("")
const confirm  = ref("")
const saving   = ref(false)
const done     = ref(false)

// Decode the JWT payload (no signature check — API verifies on submit)
const tokenPayload = computed(() => {
  if (!token.value) return null
  try {
    const payload = token.value.split(".")[1]
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
  } catch {
    return null
  }
})

const siteName = computed(() => tokenPayload.value?.site || "")

const mismatch = computed(() => confirm.value && password.value !== confirm.value)

async function handleReset() {
  if (!password.value || password.value.length < 6) {
    toast.add({ title: "A senha deve ter pelo menos 6 caracteres.", color: "error" })
    return
  }
  if (password.value !== confirm.value) {
    toast.add({ title: "As senhas não coincidem.", color: "error" })
    return
  }
  saving.value = true
  try {
    await api.post("/auth/reset-password", { token: token.value, password: password.value })
    done.value = true
  } catch (e: any) {
    toast.add({ title: e?.data?.error || "Token inválido ou expirado.", color: "error" })
  } finally {
    saving.value = false
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
        <p class="text-xs text-gray-500 mt-1 uppercase tracking-widest">Nova senha</p>
      </div>

      <!-- No token -->
      <div v-if="!token || !tokenPayload" class="text-center space-y-4 py-2">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10 text-yellow-500 mx-auto" />
        <p class="text-sm text-gray-400">Link inválido ou expirado.</p>
        <NuxtLink to="/login">
          <UButton variant="ghost" color="neutral" block>Voltar ao login</UButton>
        </NuxtLink>
      </div>

      <!-- Success -->
      <div v-else-if="done" class="text-center space-y-4 py-2">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 mb-2">
          <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-green-400" />
        </div>
        <p class="text-sm font-medium text-white">Senha alterada com sucesso!</p>
        <p class="text-xs text-gray-500">Já pode fazer login com a nova senha.</p>
        <NuxtLink :to="`/login?site=${siteName}`">
          <UButton block class="mt-2">Ir para o login</UButton>
        </NuxtLink>
      </div>

      <!-- Reset form -->
      <form v-else @submit.prevent="handleReset" class="space-y-4">

        <!-- Site (read-only, decoded from token) -->
        <UFormField label="Site">
          <UInput
            :model-value="siteName"
            icon="i-heroicons-globe-alt"
            class="w-full"
            disabled
          />
        </UFormField>

        <UFormField label="Nova senha" required>
          <UInput
            v-model="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            icon="i-heroicons-lock-closed"
            class="w-full"
            autofocus
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField label="Confirmar senha" required :error="mismatch ? 'As senhas não coincidem' : undefined">
          <UInput
            v-model="confirm"
            type="password"
            placeholder="Repita a senha"
            icon="i-heroicons-lock-closed"
            class="w-full"
            autocomplete="new-password"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="saving"
          :disabled="!password || !confirm || !!mismatch"
          icon="i-heroicons-check"
          class="mt-2"
        >
          Guardar nova senha
        </UButton>

        <div class="text-center pt-1">
          <NuxtLink :to="siteName ? `/login?site=${siteName}` : '/login'" class="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            ← Voltar ao login
          </NuxtLink>
        </div>
      </form>

    </UCard>
  </div>
</template>
