<script setup lang="ts">
definePageMeta({ layout: "root" })

const api   = useApi()
const toast = useToast()

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

const saving = ref(false)

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

        <!-- Vendor form -->
        <section>
          <h2 class="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <UIcon name="i-heroicons-building-storefront" class="w-4 h-4 text-primary-400" />
            Dados do fornecedor / empresa
          </h2>

          <div class="space-y-4">
            <UFormField label="Nome da empresa">
              <UInput v-model="form.name" placeholder="Ex: Sirius Studio" class="w-full" />
            </UFormField>

            <UFormField label="Logo (URL da imagem)">
              <div class="space-y-2">
                <UInput v-model="form.logo" placeholder="https://… ou caminho de mídia do CMS" class="w-full" />
                <div v-if="form.logo" class="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-800">
                  <img :src="form.logo" alt="Logo preview" class="h-10 object-contain max-w-[160px]" @error="($event.target as HTMLImageElement).style.display='none'" />
                  <span class="text-xs text-gray-500">Pré-visualização do logo</span>
                </div>
              </div>
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

        <!-- PDF preview card -->
        <section v-if="form.name || form.logo">
          <h2 class="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-primary-400" />
            Como aparecerá nas faturas
          </h2>
          <div class="bg-white rounded-xl p-6 text-gray-900 border border-gray-200 shadow-sm">
            <div class="flex items-start justify-between">
              <div>
                <img v-if="form.logo" :src="form.logo" alt="Logo" class="h-10 object-contain mb-2 max-w-[200px]" />
                <div v-else class="font-black text-lg tracking-widest uppercase">{{ form.name || "Empresa" }}</div>
                <div class="text-xs text-gray-500 space-y-0.5 mt-1">
                  <div v-if="form.address">{{ form.address }}</div>
                  <div v-if="form.phone || form.email" class="flex gap-3">
                    <span v-if="form.phone">{{ form.phone }}</span>
                    <span v-if="form.email">{{ form.email }}</span>
                  </div>
                  <div v-if="form.website">{{ form.website }}</div>
                  <div v-if="form.taxId" class="text-gray-400">{{ form.taxId }}</div>
                </div>
              </div>
              <div class="text-right">
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

      </div>
    </div>
  </div>
</template>
