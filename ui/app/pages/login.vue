<script setup lang="ts">
definePageMeta({ layout: "default" })

const route = useRoute()
const { login } = useAuth()
const api   = useApi()
const toast = useToast()

// ── Login ─────────────────────────────────────────────────
const form    = reactive({ site: "", username: "", password: "" })
const loading = ref(false)
const usernameInput = useTemplateRef<{ input?: HTMLInputElement } | HTMLInputElement>('usernameInput')

onMounted(() => {
  const querySite = route.query.site as string | undefined
  if (querySite) {
    form.site = querySite
    nextTick(() => {
      const el = usernameInput.value
      const input = (el as any)?.input ?? (el instanceof HTMLElement ? el : null)
      input?.focus()
    })
  }
})

async function handleLogin() {
  loading.value = true
  try {
    const res = await login(form.site, form.username, form.password)
    if (res.success) {
      toast.add({ title: "Bem-vindo!", color: "success" })
      const redirect = route.query.redirect as string | undefined
      await navigateTo(redirect || `/${form.site}`)
    } else {
      toast.add({ title: res.error || "Erro ao entrar.", color: "error" })
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.error || "Falha na comunicação.", color: "error" })
  } finally {
    loading.value = false
  }
}

// ── Forgot password ───────────────────────────────────────
type View = "login" | "forgot" | "forgot-sent"

const view       = ref<View>("login")
const recovery   = reactive({ site: "", username: "" })
const recovering = ref(false)

function openForgot() {
  recovery.site     = form.site
  recovery.username = form.username
  view.value        = "forgot"
}

async function handleForgot() {
  recovering.value = true
  try {
    await api.post("/auth/forgot-password", {
      site:     recovery.site,
      username: recovery.username,
    })
    view.value = "forgot-sent"
  } catch {
    // Always show success to avoid username enumeration
    view.value = "forgot-sent"
  } finally {
    recovering.value = false
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

      <!-- ── Login form ── -->
      <form v-if="view === 'login'" @submit.prevent="handleLogin" class="space-y-4">
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
            ref="usernameInput"
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

        <UButton type="submit" block :loading="loading" class="mt-2">
          Entrar
        </UButton>

        <div class="text-center pt-1">
          <button
            type="button"
            class="text-xs text-gray-600 hover:text-primary-400 transition-colors"
            @click="openForgot"
          >
            Esqueceu a senha?
          </button>
        </div>
      </form>

      <!-- ── Forgot password form ── -->
      <form v-else-if="view === 'forgot'" @submit.prevent="handleForgot" class="space-y-4">
        <div class="text-center mb-2">
          <p class="text-sm text-gray-300 font-medium">Recuperar senha</p>
          <p class="text-xs text-gray-600 mt-1">Indique o site e o utilizador. Receberá um email com as instruções.</p>
        </div>

        <UFormField label="Site" required>
          <UInput
            v-model="recovery.site"
            placeholder="ex: meu-site"
            icon="i-heroicons-globe-alt"
            class="w-full"
            autocomplete="off"
            autofocus
          />
        </UFormField>

        <UFormField label="Utilizador" required>
          <UInput
            v-model="recovery.username"
            placeholder="admin"
            icon="i-heroicons-user"
            class="w-full"
            autocomplete="username"
          />
        </UFormField>

        <UButton type="submit" block :loading="recovering" icon="i-heroicons-envelope" class="mt-2">
          Enviar instruções
        </UButton>

        <div class="text-center pt-1">
          <button
            type="button"
            class="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            @click="view = 'login'"
          >
            ← Voltar ao login
          </button>
        </div>
      </form>

      <!-- ── Sent confirmation ── -->
      <div v-else class="text-center space-y-4 py-2">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 mb-2">
          <UIcon name="i-heroicons-envelope-open" class="w-6 h-6 text-green-400" />
        </div>
        <p class="text-sm font-medium text-white">Verifique o seu email</p>
        <p class="text-xs text-gray-500 leading-relaxed">
          Se existir uma conta com esse utilizador e email registado, receberá as instruções de recuperação em breve.
        </p>
        <UButton variant="ghost" color="neutral" block @click="view = 'login'">
          Voltar ao login
        </UButton>
      </div>

    </UCard>
  </div>
</template>
