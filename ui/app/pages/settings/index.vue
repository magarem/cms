<script setup lang="ts">
definePageMeta({ layout: "root" })

const api    = useApi()
const toast  = useToast()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase as string

const { data, refresh } = await useAsyncData(
  "vendor-settings",
  () => api.get<{ success: boolean; vendor: any }>("/admin/settings/vendor"),
  { server: false }
)

const form = ref({
  name:    "",
  logo:    "",
  address: "",
  phone:   "",
  email:   "",
  website: "",
  taxId:   "",
})

const saving      = ref(false)
const uploading   = ref(false)
const isDragging  = ref(false)
const fileInput   = ref<HTMLInputElement | null>(null)

// ── WhatsApp status ───────────────────────────────────────
const waStatus      = ref<any>(null)
const waLoading     = ref(false)

async function checkWaStatus() {
  waLoading.value = true
  try {
    const res = await api.get<{ success: boolean; status: any; error?: string }>("/admin/settings/whatsapp/status")
    waStatus.value = res
  } catch (e: any) {
    waStatus.value = { success: false, error: e.data?.error || "Erro de conexão" }
  } finally {
    waLoading.value = false
  }
}

const waConnected = computed(() => waStatus.value?.status?.connected === true)

watch(data, (d) => {
  if (d?.vendor) {
    form.value = {
      name:    d.vendor.name    || "",
      logo:    d.vendor.logo    || "",
      address: d.vendor.address || "",
      phone:   d.vendor.phone   || "",
      email:   d.vendor.email   || "",
      website: d.vendor.website || "",
      taxId:   d.vendor.taxId   || "",
    }
  }
}, { immediate: true })

// ── Logo upload ───────────────────────────────────────────
async function uploadFile(file: File) {
  if (!file.type.startsWith("image/")) {
    toast.add({ title: "Apenas imagens são aceites.", color: "warning" })
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`${apiBase}/admin/settings/vendor/upload`, {
      method: "POST",
      credentials: "include",
      body: fd,
    })
    if (!res.ok) throw new Error("Upload falhou")
    const { file: filename } = await res.json()
    form.value.logo = `${apiBase}/admin/settings/vendor/media?file=${filename}`
    toast.add({ title: "Logo enviado.", color: "success" })
  } catch {
    toast.add({ title: "Erro ao enviar imagem.", color: "error" })
  } finally {
    uploading.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) uploadFile(file)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) uploadFile(file)
}

function removeLogo() {
  form.value.logo = ""
  if (fileInput.value) fileInput.value.value = ""
}

// ── Save ──────────────────────────────────────────────────
async function save() {
  saving.value = true
  try {
    await api.put("/admin/settings/vendor", form.value)
    toast.add({ title: "Configurações salvas.", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <div>
        <h1 class="text-lg font-semibold text-white">Configurações</h1>
        <p class="text-xs text-gray-500 mt-0.5">Dados do emissor usados em faturas e documentos</p>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-2xl space-y-8">

        <section>
          <h2 class="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <UIcon name="i-heroicons-building-storefront" class="w-4 h-4 text-primary-400" />
            Dados do fornecedor / empresa
          </h2>

          <div class="space-y-5">

            <!-- Logo upload zone -->
            <UFormField label="Logo da empresa">
              <div class="space-y-3">
                <!-- Current logo -->
                <div v-if="form.logo" class="flex items-center gap-4 p-4 bg-gray-900 border border-gray-700 rounded-xl">
                  <img
                    :src="form.logo"
                    alt="Logo"
                    class="h-12 max-w-[180px] object-contain"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-300 font-medium">Logo atual</p>
                    <p class="text-xs text-gray-600 truncate mt-0.5">{{ form.logo }}</p>
                  </div>
                  <UButton
                    icon="i-heroicons-trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    title="Remover logo"
                    @click="removeLogo"
                  />
                </div>

                <!-- Drop zone -->
                <div
                  class="relative border-2 border-dashed rounded-xl transition-colors cursor-pointer"
                  :class="isDragging
                    ? 'border-primary-500 bg-primary-500/5'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'"
                  @click="fileInput?.click()"
                  @dragover.prevent="isDragging = true"
                  @dragleave="isDragging = false"
                  @drop.prevent="onDrop"
                >
                  <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div v-if="uploading" class="flex flex-col items-center gap-2">
                      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary-400 animate-spin" />
                      <p class="text-sm text-gray-400">A enviar…</p>
                    </div>
                    <div v-else class="flex flex-col items-center gap-2">
                      <UIcon name="i-heroicons-arrow-up-tray" class="w-8 h-8 text-gray-500" />
                      <p class="text-sm text-gray-400">
                        <span class="text-primary-400 font-medium">Clique para escolher</span>
                        ou arraste a imagem aqui
                      </p>
                      <p class="text-xs text-gray-600">PNG, JPG, SVG, WebP — máx. 5 MB</p>
                    </div>
                  </div>
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/*"
                    class="absolute inset-0 opacity-0 cursor-pointer"
                    @change="onFileChange"
                    @click.stop
                  />
                </div>
              </div>
            </UFormField>

            <UFormField label="Nome da empresa">
              <UInput v-model="form.name" placeholder="Ex: Maga Web Tec" class="w-full" />
            </UFormField>

            <UFormField label="Endereço completo">
              <UInput v-model="form.address" placeholder="Rua, número, bairro, cidade, estado, CEP" class="w-full" />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Telefone / WhatsApp">
                <UInput v-model="form.phone" placeholder="+55 11 99999-9999" class="w-full" />
              </UFormField>
              <UFormField label="Email de contato">
                <UInput v-model="form.email" type="email" placeholder="contato@empresa.com" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Website">
                <UInput v-model="form.website" placeholder="https://empresa.com" class="w-full" />
              </UFormField>
              <UFormField label="CNPJ / CPF">
                <UInput v-model="form.taxId" placeholder="00.000.000/0001-00" class="w-full" />
              </UFormField>
            </div>
          </div>
        </section>

        <!-- PDF preview -->
        <section v-if="form.name || form.logo">
          <h2 class="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-primary-400" />
            Como aparecerá nas faturas
          </h2>
          <div class="bg-white rounded-xl p-6 text-gray-900 border border-gray-200 shadow-sm">
            <div class="flex items-start justify-between gap-6">
              <div>
                <img v-if="form.logo" :src="form.logo" alt="Logo" class="h-10 max-w-[200px] object-contain mb-2" />
                <div v-else class="font-black text-xl tracking-widest uppercase text-gray-900">{{ form.name }}</div>
                <div class="text-xs text-gray-500 mt-1 space-y-0.5">
                  <div v-if="form.address">{{ form.address }}</div>
                  <div v-if="form.phone || form.email">{{ [form.phone, form.email].filter(Boolean).join("  ·  ") }}</div>
                  <div v-if="form.website">{{ form.website }}</div>
                  <div v-if="form.taxId" class="text-gray-400">{{ form.taxId }}</div>
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-xs text-gray-400 uppercase tracking-widest">Fatura</div>
                <div class="text-2xl font-black text-gray-800">#inv-00000</div>
              </div>
            </div>
          </div>
        </section>

        <div class="pt-2">
          <UButton icon="i-heroicons-check" :loading="saving" @click="save">
            Salvar configurações
          </UButton>
        </div>

        <!-- WhatsApp section -->
        <section class="pt-4 border-t border-gray-800">
          <h2 class="text-sm font-semibold text-gray-300 mb-1 flex items-center gap-2">
            <UIcon name="i-simple-icons-whatsapp" class="w-4 h-4 text-green-400" />
            WhatsApp — Z-API
          </h2>
          <p class="text-xs text-gray-500 mb-4">
            Configure as variáveis de ambiente <code class="text-gray-400 bg-gray-800 px-1 rounded">ZAPI_INSTANCE_ID</code>,
            <code class="text-gray-400 bg-gray-800 px-1 rounded">ZAPI_TOKEN</code> e
            <code class="text-gray-400 bg-gray-800 px-1 rounded">ZAPI_CLIENT_TOKEN</code>
            no servidor para ativar o envio real de faturas via WhatsApp.
            Crie a instância em <span class="text-primary-400">z-api.io</span> e escaneie o QR code lá.
          </p>

          <div class="flex items-center gap-3">
            <UButton
              icon="i-heroicons-signal"
              size="sm"
              color="neutral"
              variant="outline"
              :loading="waLoading"
              @click="checkWaStatus"
            >
              Verificar conexão
            </UButton>

            <div v-if="waStatus" class="flex items-center gap-2 text-sm">
              <div
                class="w-2 h-2 rounded-full flex-shrink-0"
                :class="waConnected ? 'bg-green-400' : 'bg-red-400'"
              />
              <span :class="waConnected ? 'text-green-400' : 'text-red-400'">
                {{ waConnected ? 'Conectado' : (waStatus.error || 'Desconectado') }}
              </span>
              <span v-if="waStatus.status?.phone" class="text-gray-500 text-xs">
                · {{ waStatus.status.phone }}
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>
