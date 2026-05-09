<script setup lang="ts">
definePageMeta({ layout: "cms" })

const route = useRoute()
const api = useApi()
const toast = useToast()
const site = route.params.site as string

const { data: usersData, refresh } = await useAsyncData(
  "users-list",
  () => api.get<{ success: boolean; users: any[] }>("/users"),
  { server: false }
)

const users = computed(() => usersData.value?.users || [])

const ROLE_COLOR: Record<string, "error" | "warning" | "info"> = {
  admin: "error",
  editor: "warning",
  viewer: "info",
}

const roleOptions = [
  { label: "Admin", value: "admin" },
  { label: "Editor", value: "editor" },
  { label: "Viewer", value: "viewer" },
]

// ── Create / Edit modal ──────────────────────────────────────
const showModal = ref(false)
const editingUser = ref<any>(null)
const saving = ref(false)

const form = ref({
  username: "",
  password: "",
  role: "editor" as "admin" | "editor" | "viewer",
})

const isEdit = computed(() => !!editingUser.value)
const modalTitle = computed(() => isEdit.value ? "Editar usuário" : "Novo usuário")

function openCreate() {
  editingUser.value = null
  form.value = { username: "", password: "", role: "editor" }
  showModal.value = true
}

function openEdit(user: any) {
  editingUser.value = user
  form.value = { username: user.username, password: "", role: user.role }
  showModal.value = true
}

async function submitForm() {
  saving.value = true
  try {
    if (isEdit.value) {
      const payload: any = { role: form.value.role }
      if (form.value.password) payload.password = form.value.password
      await api.put(`/users/${editingUser.value.id}`, payload)
      toast.add({ title: "Usuário atualizado.", color: "success" })
    } else {
      await api.post("/users", {
        username: form.value.username,
        password: form.value.password,
        role: form.value.role,
      })
      toast.add({ title: "Usuário criado.", color: "success" })
    }
    showModal.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}

// ── Delete modal ─────────────────────────────────────────────
const showDelete = ref(false)
const deletingUser = ref<any>(null)
const deleting = ref(false)

function openDelete(user: any) {
  deletingUser.value = user
  showDelete.value = true
}

async function submitDelete() {
  if (!deletingUser.value) return
  deleting.value = true
  try {
    await api.del(`/users/${deletingUser.value.id}`)
    toast.add({ title: "Usuário eliminado.", color: "success" })
    showDelete.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao eliminar.", color: "error" })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <CmsTopbar :site="site">
    <template #breadcrumb>
      <NuxtLink :to="`/${site}`" class="text-gray-500 hover:text-white transition-colors flex-shrink-0">
        <UIcon name="i-heroicons-home" class="w-4 h-4" />
      </NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-700 flex-shrink-0" />
      <span class="text-white font-medium">Usuários</span>
    </template>
    <template #actions>
      <UButton icon="i-heroicons-user-plus" size="sm" @click="openCreate">Novo usuário</UButton>
    </template>
  </CmsTopbar>

  <!-- Content -->
  <div class="flex-1 overflow-auto p-6">
    <div class="max-w-2xl">
      <div v-if="users.length === 0" class="text-center text-gray-600 py-16 text-sm">
        Nenhum usuário encontrado.
      </div>

      <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
              <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Função</th>
              <th class="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                    {{ user.username?.[0]?.toUpperCase() }}
                  </div>
                  <span class="font-medium text-white">{{ user.username }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <UBadge :color="ROLE_COLOR[user.role] || 'neutral'" variant="subtle" size="xs">
                  {{ user.role }}
                </UBadge>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    icon="i-heroicons-pencil-square"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    title="Editar"
                    @click="openEdit(user)"
                  />
                  <UButton
                    icon="i-heroicons-trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    title="Eliminar"
                    @click="openDelete(user)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Create / Edit modal -->
  <UModal v-model:open="showModal" :title="modalTitle">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Username" required>
          <UInput
            v-model="form.username"
            :disabled="isEdit"
            placeholder="username"
            autofocus
            class="w-full font-mono"
          />
        </UFormField>

        <UFormField :label="isEdit ? 'Nova senha (deixe vazio para manter)' : 'Senha'" :required="!isEdit">
          <UInput
            v-model="form.password"
            type="password"
            :placeholder="isEdit ? '••••••••' : 'Mínimo 6 caracteres'"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Função" required>
          <USelect
            v-model="form.role"
            :items="roleOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showModal = false">Cancelar</UButton>
        <UButton
          :icon="isEdit ? 'i-heroicons-check' : 'i-heroicons-user-plus'"
          :loading="saving"
          :disabled="!isEdit && (!form.username.trim() || !form.password.trim())"
          @click="submitForm"
        >
          {{ isEdit ? "Salvar" : "Criar" }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation modal -->
  <UModal v-model:open="showDelete" title="Eliminar usuário">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar o usuário
        <span class="font-mono text-white bg-gray-800 px-1.5 py-0.5 rounded text-xs">{{ deletingUser?.username }}</span>?
        Esta ação não pode ser revertida.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDelete = false">Cancelar</UButton>
        <UButton
          icon="i-heroicons-trash"
          color="error"
          :loading="deleting"
          @click="submitDelete"
        >
          Eliminar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
