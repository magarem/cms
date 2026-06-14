<script setup lang="ts">
definePageMeta({ layout: "root" })

const route  = useRoute()
const api    = useApi()
const toast  = useToast()
const id     = route.params.id as string

const { data, refresh } = await useAsyncData(
  `client-${id}`,
  () => api.get<{ success: boolean; client: any }>(`/admin/clients/${id}`),
  { server: false }
)

const client   = computed(() => data.value?.client || null)
const tab      = ref<"dados" | "sites" | "faturas" | "suporte">("dados")

// ── All sites list (for linking) ──────────────────────────
const { data: sitesData } = await useAsyncData(
  "all-sites-for-client",
  () => api.get<{ sites: any[] }>("/sites"),
  { server: false }
)

// ── Vendor settings (for PDF header) ─────────────────────
const { data: vendorData } = await useAsyncData(
  "vendor-for-pdf",
  () => api.get<{ vendor: any }>("/admin/settings/vendor"),
  { server: false }
)
const vendor = computed(() => vendorData.value?.vendor || {})

// ── Products / services catalog ───────────────────────────
const { data: productsData } = await useAsyncData(
  "products-for-invoice",
  () => api.get<{ products: any[] }>("/admin/products"),
  { server: false }
)
const catalog        = computed(() => (productsData.value?.products || []).filter((p: any) => p.active))
const showCatalog    = ref(false)
const catalogSearch  = ref("")
const catalogFiltered = computed(() => {
  const q = catalogSearch.value.toLowerCase()
  return q ? catalog.value.filter((p: any) => p.name.toLowerCase().includes(q)) : catalog.value
})

function addFromCatalog(p: any) {
  invoiceForm.value.items.push({ label: `${p.name}${p.unit ? ` (${p.unit})` : ""}`, amount: p.price })
  if (!invoiceForm.value.description) invoiceForm.value.description = p.name
  showCatalog.value = false
  catalogSearch.value = ""
}

function fmtMoneyCatalog(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}
const allSites     = computed(() => sitesData.value?.sites || [])
const clientSites  = computed(() => client.value?.sites || [])
const linkedSites  = computed(() => allSites.value.filter(s => clientSites.value.includes(s.id)))
const unlinkedSites = computed(() => allSites.value.filter(s => !clientSites.value.includes(s.id)))

// ══════════════════════════════════════════════════════════
// TAB: DADOS
// ══════════════════════════════════════════════════════════
const profile  = ref({ name: "", email: "", phone: "", address: "", notes: "" })
const saving   = ref(false)

watch(client, (c) => {
  if (c) profile.value = { name: c.name || "", email: c.email || "", phone: c.phone || "", address: c.address || "", notes: c.notes || "" }
}, { immediate: true })

async function saveProfile() {
  saving.value = true
  try {
    await api.put(`/admin/clients/${id}`, profile.value)
    toast.add({ title: "Perfil atualizado.", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao salvar.", color: "error" })
  } finally {
    saving.value = false
  }
}

// ── Delete client ─────────────────────────────────────────
const showDeleteClient = ref(false)
const deletingClient   = ref(false)

async function deleteClient() {
  deletingClient.value = true
  try {
    await api.del(`/admin/clients/${id}`)
    toast.add({ title: "Conta eliminada.", color: "success" })
    navigateTo("/clients")
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao eliminar.", color: "error" })
  } finally {
    deletingClient.value = false
  }
}

// ══════════════════════════════════════════════════════════
// TAB: SITES
// ══════════════════════════════════════════════════════════
const showAddSite    = ref(false)
const selectedSiteId = ref("")
const addingSite     = ref(false)

async function linkSite() {
  if (!selectedSiteId.value) return
  addingSite.value = true
  try {
    await api.post(`/admin/clients/${id}/sites`, { siteId: selectedSiteId.value })
    toast.add({ title: "Site vinculado.", color: "success" })
    showAddSite.value = false
    selectedSiteId.value = ""
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro.", color: "error" })
  } finally {
    addingSite.value = false
  }
}

async function unlinkSite(siteId: string) {
  try {
    await api.del(`/admin/clients/${id}/sites/${siteId}`)
    toast.add({ title: "Site desvinculado.", color: "success" })
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro.", color: "error" })
  }
}

// ══════════════════════════════════════════════════════════
// TAB: FATURAS
// ══════════════════════════════════════════════════════════
const invoices = computed(() => client.value?.invoices || [])

const STATUS_INVOICE: Record<string, { label: string; color: "success" | "warning" | "error" | "neutral" }> = {
  paid:      { label: "Pago",      color: "success" },
  pending:   { label: "Pendente",  color: "warning" },
  overdue:   { label: "Vencida",   color: "error"   },
  cancelled: { label: "Cancelada", color: "neutral" },
}

const showInvoiceModal = ref(false)
const editingInvoice   = ref<any>(null)
const savingInvoice    = ref(false)
const invoiceForm      = ref({
  description: "",
  items: [{ label: "", amount: 0 }] as { label: string; amount: number }[],
  status: "pending" as "pending" | "paid" | "overdue" | "cancelled",
  dueDate: "",
  paidAt: "",
})

const invoiceTotal = computed(() => invoiceForm.value.items.reduce((s, i) => s + (Number(i.amount) || 0), 0))

function openCreateInvoice() {
  editingInvoice.value = null
  invoiceForm.value = { description: "", items: [{ label: "", amount: 0 }], status: "pending", dueDate: "", paidAt: "" }
  showInvoiceModal.value = true
}

function openEditInvoice(inv: any) {
  editingInvoice.value = inv
  invoiceForm.value = {
    description: inv.description,
    items: inv.items?.length ? [...inv.items] : [{ label: "", amount: 0 }],
    status: inv.status,
    dueDate: inv.dueDate || "",
    paidAt: inv.paidAt || "",
  }
  showInvoiceModal.value = true
}

function addItem() { invoiceForm.value.items.push({ label: "", amount: 0 }) }
function removeItem(i: number) { if (invoiceForm.value.items.length > 1) invoiceForm.value.items.splice(i, 1) }

async function saveInvoice() {
  savingInvoice.value = true
  try {
    const payload = { ...invoiceForm.value, total: invoiceTotal.value }
    if (editingInvoice.value) {
      await api.put(`/admin/clients/${id}/invoices/${editingInvoice.value.id}`, payload)
      toast.add({ title: "Fatura atualizada.", color: "success" })
    } else {
      await api.post(`/admin/clients/${id}/invoices`, payload)
      toast.add({ title: "Fatura criada.", color: "success" })
    }
    showInvoiceModal.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro ao salvar.", color: "error" })
  } finally {
    savingInvoice.value = false
  }
}

async function markPaid(inv: any) {
  try {
    await api.put(`/admin/clients/${id}/invoices/${inv.id}`, { status: "paid", paidAt: new Date().toISOString() })
    toast.add({ title: "Marcada como paga.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro.", color: "error" })
  }
}

async function deleteInvoice(invId: string) {
  try {
    await api.del(`/admin/clients/${id}/invoices/${invId}`)
    toast.add({ title: "Fatura eliminada.", color: "success" })
    await refresh()
  } catch {
    toast.add({ title: "Erro.", color: "error" })
  }
}

function fmtDate(iso: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function buildInvoiceText(inv: any) {
  const lines = [
    `*Fatura — ${client.value?.name}*`,
    `📋 ${inv.description}`,
    "",
    ...(inv.items || []).map((item: any) => `• ${item.label}: ${fmtMoney(item.amount)}`),
    "",
    `*Total: ${fmtMoney(inv.total)}*`,
    inv.dueDate ? `Vencimento: ${fmtDate(inv.dueDate)}` : "",
  ].filter(Boolean)
  return lines.join("\n")
}

function sendByWhatsApp(inv: any) {
  const phone = (client.value?.phone || "").replace(/\D/g, "")
  if (!phone) { toast.add({ title: "Cliente sem telefone cadastrado.", color: "warning" }); return }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildInvoiceText(inv))}`, "_blank")
}

function sendByEmail(inv: any) {
  const email = client.value?.email
  if (!email) { toast.add({ title: "Cliente sem email cadastrado.", color: "warning" }); return }
  const subject = encodeURIComponent(`Fatura — ${inv.description}`)
  const body    = encodeURIComponent(buildInvoiceText(inv).replace(/\*/g, ""))
  window.open(`mailto:${email}?subject=${subject}&body=${body}`)
}

function exportPDF(inv: any) {
  const v = vendor.value
  const statusClass: Record<string, string> = {
    paid: "status-paid", pending: "status-pending", overdue: "status-overdue", cancelled: "status-cancelled",
  }
  const rows = (inv.items || []).map((item: any) => `
    <tr>
      <td>${item.label}</td>
      <td class="amount">${fmtMoney(item.amount)}</td>
    </tr>`).join("")

  const vendorHeader = v.logo
    ? `<img src="${v.logo}" alt="${v.name || ''}" style="height:48px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px">`
    : `<div class="brand-name">${v.name || "Empresa"}</div>`

  const vendorContact = [
    v.address,
    [v.phone, v.email].filter(Boolean).join("  ·  "),
    v.website,
    v.taxId ? `CNPJ/CPF: ${v.taxId}` : "",
  ].filter(Boolean).map(l => `<div>${l}</div>`).join("")

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Fatura ${inv.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Helvetica Neue",Arial,sans-serif;color:#111;background:#fff;padding:48px;font-size:14px;line-height:1.6}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .vendor-contact{font-size:11px;color:#888;margin-top:6px;line-height:1.6}
  .brand-name{font-size:20px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#111}
  .inv-ref{text-align:right;flex-shrink:0;margin-left:32px}
  .inv-ref .tag{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888}
  .inv-ref .num{font-size:22px;font-weight:800;color:#111;white-space:nowrap}
  h1{font-size:24px;font-weight:800;margin-bottom:28px;color:#111}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:22px;background:#f5f5f5;border-radius:8px;margin-bottom:36px}
  .meta-block .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4px}
  .meta-block .val{font-weight:700;color:#111}
  .meta-block .sub{color:#555;font-size:13px}
  .meta-right{text-align:right}
  .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
  .status-paid{background:#d1fae5;color:#065f46}
  .status-pending{background:#fef3c7;color:#92400e}
  .status-overdue{background:#fee2e2;color:#991b1b}
  .status-cancelled{background:#f3f4f6;color:#6b7280}
  table{width:100%;border-collapse:collapse;margin-bottom:0}
  thead tr{border-bottom:2px solid #111}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888;padding:10px 0;text-align:left}
  th.amount,td.amount{text-align:right}
  tbody tr{border-bottom:1px solid #e5e5e5}
  tbody tr:last-child{border-bottom:none}
  td{padding:13px 0;color:#222}
  td.amount{font-weight:600}
  .totals{margin-top:16px;padding-top:16px;border-top:2px solid #111;display:flex;justify-content:flex-end}
  .total-box{text-align:right}
  .total-box .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888}
  .total-box .val{font-size:28px;font-weight:900;color:#111;margin-top:2px}
  .footer{margin-top:56px;padding-top:18px;border-top:1px solid #e5e5e5;display:flex;justify-content:space-between;color:#bbb;font-size:11px}
  @media print{body{padding:28px}@page{margin:.8cm;size:A4}}
</style>
</head>
<body>
<div class="top">
  <div>
    ${vendorHeader}
    <div class="vendor-contact">${vendorContact}</div>
  </div>
  <div class="inv-ref">
    <div class="tag">Fatura</div>
    <div class="num">#${inv.id}</div>
  </div>
</div>

<h1>${inv.description}</h1>

<div class="meta">
  <div class="meta-block">
    <div class="lbl">Cliente</div>
    <div class="val">${client.value?.name || "—"}</div>
    ${client.value?.email   ? `<div class="sub">${client.value.email}</div>`   : ""}
    ${client.value?.phone   ? `<div class="sub">${client.value.phone}</div>`   : ""}
    ${client.value?.address ? `<div class="sub">${client.value.address}</div>` : ""}
  </div>
  <div class="meta-block meta-right">
    <div class="lbl">Status</div>
    <div><span class="badge ${statusClass[inv.status] || ""}">${STATUS_INVOICE[inv.status]?.label || inv.status}</span></div>
    <div style="margin-top:12px">
      <div class="lbl">Emitida em</div>
      <div class="val" style="font-size:13px;font-weight:600">${fmtDate(inv.createdAt)}</div>
    </div>
    ${inv.dueDate ? `<div style="margin-top:8px"><div class="lbl">Vencimento</div><div class="val" style="font-size:13px;font-weight:600">${fmtDate(inv.dueDate)}</div></div>` : ""}
    ${inv.paidAt  ? `<div style="margin-top:8px"><div class="lbl">Pago em</div><div class="val" style="font-size:13px;font-weight:600">${fmtDate(inv.paidAt)}</div></div>`  : ""}
  </div>
</div>

<table>
  <thead><tr><th>Descrição</th><th class="amount">Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <div class="total-box">
    <div class="lbl">Total</div>
    <div class="val">${fmtMoney(inv.total)}</div>
  </div>
</div>

<div class="footer">
  <div>${v.name || ""}${v.name && new Date().getFullYear() ? " — " : ""}${new Date().getFullYear()}</div>
  <div>${inv.id}</div>
</div>

<script>window.onload=()=>{window.print()}<\/script>
</body>
</html>`

  const w = window.open("", "_blank", "width=860,height=1100")
  if (w) { w.document.write(html); w.document.close() }
}

const totalPaid    = computed(() => invoices.value.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + i.total, 0))
const totalPending = computed(() => invoices.value.filter((i: any) => i.status === "pending").reduce((s: number, i: any) => s + i.total, 0))

// ══════════════════════════════════════════════════════════
// TAB: SUPORTE
// ══════════════════════════════════════════════════════════
const tickets     = computed(() => client.value?.support || [])
const activeTicket = ref<any>(null)

const STATUS_TICKET: Record<string, { label: string; color: "success" | "warning" | "info" | "neutral" }> = {
  open:        { label: "Aberto",      color: "warning" },
  in_progress: { label: "Em progresso", color: "info"   },
  resolved:    { label: "Resolvido",   color: "success" },
  closed:      { label: "Encerrado",   color: "neutral" },
}

const showTicketModal = ref(false)
const newTicketForm   = ref({ subject: "", message: "" })
const creatingTicket  = ref(false)
const replyText       = ref("")
const sendingReply    = ref(false)

async function createTicket() {
  if (!newTicketForm.value.subject.trim()) return
  creatingTicket.value = true
  try {
    await api.post(`/admin/clients/${id}/support`, newTicketForm.value)
    toast.add({ title: "Ticket criado.", color: "success" })
    showTicketModal.value = false
    newTicketForm.value = { subject: "", message: "" }
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro.", color: "error" })
  } finally {
    creatingTicket.value = false
  }
}

async function sendReply() {
  if (!replyText.value.trim() || !activeTicket.value) return
  sendingReply.value = true
  try {
    await api.post(`/admin/clients/${id}/support/${activeTicket.value.id}/reply`, { text: replyText.value, from: "admin" })
    replyText.value = ""
    await refresh()
    const updated = (data.value?.client?.support || []).find((t: any) => t.id === activeTicket.value.id)
    if (updated) activeTicket.value = updated
  } catch (e: any) {
    toast.add({ title: e.data?.error || "Erro.", color: "error" })
  } finally {
    sendingReply.value = false
  }
}

async function setTicketStatus(ticketId: string, status: string) {
  try {
    await api.put(`/admin/clients/${id}/support/${ticketId}`, { status })
    await refresh()
    const updated = (data.value?.client?.support || []).find((t: any) => t.id === ticketId)
    if (activeTicket.value?.id === ticketId) activeTicket.value = updated
  } catch {
    toast.add({ title: "Erro.", color: "error" })
  }
}

function initials(name: string) {
  return (name || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

const TABS = [
  { key: "dados",   label: "Dados",    icon: "i-heroicons-user" },
  { key: "sites",   label: "Sites",    icon: "i-heroicons-globe-alt" },
  { key: "faturas", label: "Faturas",  icon: "i-heroicons-document-text" },
  { key: "suporte", label: "Suporte",  icon: "i-heroicons-chat-bubble-left-ellipsis" },
]
</script>

<template>
  <div v-if="!client" class="flex items-center justify-center h-full">
    <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-500 animate-spin" />
  </div>

  <div v-else class="flex flex-col h-full">

    <!-- Account header -->
    <div class="flex-shrink-0 bg-gray-900 border-b border-gray-800">
      <div class="flex items-center gap-4 px-6 pt-4 pb-0">
        <!-- Back -->
        <NuxtLink to="/clients" class="text-gray-500 hover:text-white transition-colors mr-2">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        </NuxtLink>

        <!-- Avatar -->
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-violet-600 flex items-center justify-center text-base font-bold text-white flex-shrink-0 shadow-lg">
          {{ initials(client.name) }}
        </div>

        <div class="min-w-0">
          <h1 class="text-base font-semibold text-white leading-tight truncate">{{ client.name }}</h1>
          <p class="text-xs text-gray-500 mt-0.5">
            <span v-if="client.email">{{ client.email }}</span>
            <span v-if="client.email && client.phone" class="mx-1.5">·</span>
            <span v-if="client.phone">{{ client.phone }}</span>
            <span v-if="!client.email && !client.phone" class="italic">Sem contacto</span>
          </p>
        </div>

        <!-- Quick stats -->
        <div class="ml-auto flex items-center gap-6 text-center">
          <div>
            <div class="text-lg font-bold text-white">{{ clientSites.length }}</div>
            <div class="text-[10px] text-gray-500 uppercase tracking-wider">Sites</div>
          </div>
          <div>
            <div class="text-lg font-bold text-green-400">{{ fmtMoney(totalPaid) }}</div>
            <div class="text-[10px] text-gray-500 uppercase tracking-wider">Pago</div>
          </div>
          <div>
            <div class="text-lg font-bold text-yellow-400">{{ fmtMoney(totalPending) }}</div>
            <div class="text-[10px] text-gray-500 uppercase tracking-wider">A receber</div>
          </div>
          <div>
            <div class="text-lg font-bold" :class="tickets.filter((t: any) => t.status === 'open').length > 0 ? 'text-orange-400' : 'text-gray-500'">
              {{ tickets.filter((t: any) => t.status === 'open').length }}
            </div>
            <div class="text-[10px] text-gray-500 uppercase tracking-wider">Suporte aberto</div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-0 px-6 mt-3">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors"
          :class="tab === t.key
            ? 'border-primary-500 text-primary-400 font-medium'
            : 'border-transparent text-gray-500 hover:text-gray-300'"
          @click="tab = t.key as any"
        >
          <UIcon :name="t.icon" class="w-3.5 h-3.5" />
          {{ t.label }}
          <UBadge
            v-if="t.key === 'suporte' && tickets.filter((x: any) => x.status === 'open').length"
            :label="String(tickets.filter((x: any) => x.status === 'open').length)"
            color="warning"
            variant="solid"
            size="xs"
            class="ml-1"
          />
        </button>
      </div>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-auto">

      <!-- ══ DADOS ══════════════════════════════════════════ -->
      <div v-if="tab === 'dados'" class="p-6 max-w-xl">
        <div class="space-y-4">
          <UFormField label="Nome completo" required>
            <UInput v-model="profile.name" placeholder="Nome do cliente ou empresa" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Email">
              <UInput v-model="profile.email" type="email" placeholder="email@exemplo.com" class="w-full" />
            </UFormField>
            <UFormField label="Telefone / WhatsApp">
              <UInput v-model="profile.phone" placeholder="+55 11 99999-9999" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Endereço completo">
            <UInput v-model="profile.address" placeholder="Rua, número, cidade, estado, CEP" class="w-full" />
          </UFormField>

          <UFormField label="Notas internas">
            <UTextarea v-model="profile.notes" placeholder="Observações, preferências, histórico…" :rows="4" class="w-full" />
          </UFormField>

          <div class="flex items-center justify-between pt-2">
            <UButton icon="i-heroicons-check" :loading="saving" @click="saveProfile">
              Salvar alterações
            </UButton>
            <UButton
              icon="i-heroicons-trash"
              color="error"
              variant="ghost"
              size="sm"
              @click="showDeleteClient = true"
            >
              Eliminar conta
            </UButton>
          </div>

          <div class="pt-4 border-t border-gray-800 text-xs text-gray-600 space-y-1">
            <div>ID: <span class="font-mono text-gray-500">{{ client.id }}</span></div>
            <div>Criado em: {{ fmtDate(client.createdAt) }}</div>
          </div>
        </div>
      </div>

      <!-- ══ SITES ═══════════════════════════════════════════ -->
      <div v-else-if="tab === 'sites'" class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-sm font-semibold text-gray-300">Sites desta conta</h2>
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-link"
              size="sm"
              color="neutral"
              variant="outline"
              @click="showAddSite = true"
            >
              Vincular site existente
            </UButton>
            <UButton
              icon="i-heroicons-plus"
              size="sm"
              :to="`/${linkedSites[0]?.id || 'login'}/assistant`"
            >
              Novo site com IA
            </UButton>
          </div>
        </div>

        <div v-if="linkedSites.length === 0" class="text-center py-16 text-gray-600">
          <UIcon name="i-heroicons-globe-alt" class="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p class="text-sm">Nenhum site vinculado a esta conta.</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="site in linkedSites"
            :key="site.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-center gap-3 mb-3">
              <div class="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                <div class="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-mono text-sm font-semibold text-white truncate">{{ site.id }}</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-heroicons-arrow-top-right-on-square"
                size="xs"
                color="neutral"
                variant="ghost"
                :to="`/${site.id}`"
                target="_blank"
              >
                CMS
              </UButton>
              <UButton
                icon="i-heroicons-eye"
                size="xs"
                color="neutral"
                variant="ghost"
              >
                Ver site
              </UButton>
              <UButton
                icon="i-heroicons-link-slash"
                size="xs"
                color="error"
                variant="ghost"
                @click="unlinkSite(site.id)"
              >
                Desvincular
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ FATURAS ═════════════════════════════════════════ -->
      <div v-else-if="tab === 'faturas'" class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-sm font-semibold text-gray-300">Faturas</h2>
          <UButton icon="i-heroicons-plus" size="sm" @click="openCreateInvoice">Nova fatura</UButton>
        </div>

        <div v-if="invoices.length === 0" class="text-center py-16 text-gray-600">
          <UIcon name="i-heroicons-document-text" class="w-10 h-10 mx-auto mb-3 text-gray-700" />
          <p class="text-sm">Nenhuma fatura emitida.</p>
        </div>

        <div v-else class="border border-gray-800 rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800 bg-gray-900/60 text-left">
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Descrição</th>
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vencimento</th>
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in invoices"
                :key="inv.id"
                class="border-b border-gray-800/50 last:border-0 hover:bg-gray-900/40 transition-colors"
              >
                <td class="px-4 py-3">
                  <div class="font-medium text-white">{{ inv.description }}</div>
                  <div class="text-xs text-gray-600 mt-0.5">{{ fmtDate(inv.createdAt) }}</div>
                </td>
                <td class="px-4 py-3 font-mono font-semibold text-white">{{ fmtMoney(inv.total) }}</td>
                <td class="px-4 py-3 text-gray-400 text-xs">
                  <div>{{ fmtDate(inv.dueDate) }}</div>
                  <div v-if="inv.paidAt" class="text-green-500 mt-0.5">Pago {{ fmtDate(inv.paidAt) }}</div>
                </td>
                <td class="px-4 py-3">
                  <UBadge
                    :label="STATUS_INVOICE[inv.status]?.label || inv.status"
                    :color="STATUS_INVOICE[inv.status]?.color || 'neutral'"
                    variant="subtle"
                    size="xs"
                  />
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton
                      v-if="inv.status === 'pending' || inv.status === 'overdue'"
                      icon="i-heroicons-check-circle"
                      size="xs"
                      color="success"
                      variant="ghost"
                      title="Marcar como pago"
                      @click="markPaid(inv)"
                    />
                    <UButton
                      icon="i-heroicons-arrow-down-tray"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      title="Exportar PDF"
                      @click="exportPDF(inv)"
                    />
                    <UButton
                      icon="i-heroicons-envelope"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      title="Enviar por email"
                      @click="sendByEmail(inv)"
                    />
                    <UButton
                      icon="i-simple-icons-whatsapp"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      title="Enviar por WhatsApp"
                      class="hover:text-green-400"
                      @click="sendByWhatsApp(inv)"
                    />
                    <UButton
                      icon="i-heroicons-pencil-square"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="openEditInvoice(inv)"
                    />
                    <UButton
                      icon="i-heroicons-trash"
                      size="xs"
                      color="error"
                      variant="ghost"
                      @click="deleteInvoice(inv.id)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ══ SUPORTE ══════════════════════════════════════════ -->
      <div v-else-if="tab === 'suporte'" class="flex h-full overflow-hidden">
        <!-- Ticket list -->
        <div class="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col">
          <div class="p-3 border-b border-gray-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tickets</span>
            <UButton icon="i-heroicons-plus" size="xs" variant="ghost" @click="showTicketModal = true" />
          </div>
          <div class="flex-1 overflow-y-auto">
            <div v-if="tickets.length === 0" class="text-center py-10 text-gray-600 text-xs px-4">
              Nenhum ticket de suporte.
            </div>
            <button
              v-for="ticket in tickets"
              :key="ticket.id"
              class="w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors"
              :class="activeTicket?.id === ticket.id ? 'bg-gray-900/60' : ''"
              @click="activeTicket = ticket"
            >
              <div class="flex items-start justify-between gap-2 mb-1">
                <span class="text-sm font-medium text-white line-clamp-1 flex-1">{{ ticket.subject }}</span>
                <UBadge
                  :label="STATUS_TICKET[ticket.status]?.label || ticket.status"
                  :color="STATUS_TICKET[ticket.status]?.color || 'neutral'"
                  variant="subtle"
                  size="xs"
                  class="flex-shrink-0"
                />
              </div>
              <div class="flex items-center gap-2 text-xs text-gray-600">
                <span>{{ ticket.messages?.length || 0 }} msg</span>
                <span>·</span>
                <span>{{ fmtDate(ticket.createdAt) }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Thread view -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <div v-if="!activeTicket" class="flex-1 flex items-center justify-center text-gray-600 text-sm">
            Selecione um ticket para ver a conversa
          </div>

          <template v-else>
            <!-- Ticket header -->
            <div class="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/40">
              <div>
                <div class="font-medium text-white text-sm">{{ activeTicket.subject }}</div>
                <div class="text-xs text-gray-600 mt-0.5">{{ fmtDate(activeTicket.createdAt) }} · {{ activeTicket.id }}</div>
              </div>
              <div class="flex items-center gap-2">
                <select
                  :value="activeTicket.status"
                  class="bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 px-2 py-1.5 outline-none"
                  @change="setTicketStatus(activeTicket.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em progresso</option>
                  <option value="resolved">Resolvido</option>
                  <option value="closed">Encerrado</option>
                </select>
              </div>
            </div>

            <!-- Messages -->
            <div class="flex-1 overflow-y-auto p-5 space-y-4">
              <div v-if="!activeTicket.messages?.length" class="text-center text-gray-600 text-sm py-8">
                Sem mensagens ainda.
              </div>
              <div
                v-for="(msg, i) in activeTicket.messages"
                :key="i"
                class="flex gap-3"
                :class="msg.from === 'admin' ? 'flex-row-reverse' : ''"
              >
                <div
                  class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  :class="msg.from === 'admin'
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'bg-gray-700 text-gray-300'"
                >
                  {{ msg.from === "admin" ? "A" : initials(client.name) }}
                </div>
                <div
                  class="max-w-sm rounded-xl px-4 py-2.5 text-sm"
                  :class="msg.from === 'admin'
                    ? 'bg-primary-500/15 border border-primary-500/20 text-gray-100'
                    : 'bg-gray-800 border border-gray-700 text-gray-200'"
                >
                  <p class="leading-relaxed">{{ msg.text }}</p>
                  <p class="text-xs mt-1 opacity-50">{{ fmtDate(msg.date) }}</p>
                </div>
              </div>
            </div>

            <!-- Reply input -->
            <div class="flex-shrink-0 p-4 border-t border-gray-800 flex gap-3">
              <UTextarea
                v-model="replyText"
                placeholder="Escreva uma resposta…"
                :rows="2"
                class="flex-1"
                @keydown.ctrl.enter="sendReply"
                @keydown.meta.enter="sendReply"
              />
              <UButton
                icon="i-heroicons-paper-airplane"
                :loading="sendingReply"
                :disabled="!replyText.trim()"
                class="self-end"
                @click="sendReply"
              />
            </div>
          </template>
        </div>
      </div>

    </div>
  </div>

  <!-- Delete client modal -->
  <UModal v-model:open="showDeleteClient" title="Eliminar conta">
    <template #body>
      <p class="text-sm text-gray-300">
        Tem a certeza que quer eliminar a conta de
        <span class="font-semibold text-white">{{ client?.name }}</span>?
        Todos os dados (faturas, suporte) serão apagados permanentemente.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showDeleteClient = false">Cancelar</UButton>
        <UButton icon="i-heroicons-trash" color="error" :loading="deletingClient" @click="deleteClient">Eliminar</UButton>
      </div>
    </template>
  </UModal>

  <!-- Link site modal -->
  <UModal v-model:open="showAddSite" title="Vincular site existente">
    <template #body>
      <UFormField label="Selecione o site">
        <USelect
          v-model="selectedSiteId"
          :items="unlinkedSites.map(s => ({ label: s.id, value: s.id }))"
          value-key="value"
          label-key="label"
          placeholder="Escolha um site…"
          class="w-full"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showAddSite = false">Cancelar</UButton>
        <UButton icon="i-heroicons-link" :loading="addingSite" :disabled="!selectedSiteId" @click="linkSite">Vincular</UButton>
      </div>
    </template>
  </UModal>

  <!-- Invoice modal -->
  <UModal v-model:open="showInvoiceModal" :title="editingInvoice ? 'Editar fatura' : 'Nova fatura'" :ui="{ width: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Descrição" required>
          <UInput v-model="invoiceForm.description" placeholder="Ex: Desenvolvimento site + 1 ano de manutenção" class="w-full" />
        </UFormField>

        <!-- Items -->
        <UFormField label="Itens">
          <div class="space-y-2">
            <div v-for="(item, i) in invoiceForm.items" :key="i" class="flex gap-2 items-center">
              <UInput v-model="item.label" placeholder="Descrição do item" class="flex-1" />
              <UInput v-model.number="item.amount" type="number" placeholder="0,00" class="w-32" />
              <UButton icon="i-heroicons-minus" size="xs" color="error" variant="ghost" @click="removeItem(i)" />
            </div>

            <div class="flex items-center gap-2 pt-1">
              <UButton icon="i-heroicons-plus" size="xs" variant="ghost" @click="addItem">Linha em branco</UButton>
              <UButton icon="i-heroicons-cube" size="xs" variant="ghost" color="primary" @click="showCatalog = !showCatalog">
                Do catálogo
              </UButton>
            </div>

            <!-- Catalog picker -->
            <div v-if="showCatalog" class="border border-gray-700 rounded-xl bg-gray-900 overflow-hidden mt-1">
              <div class="p-2 border-b border-gray-800">
                <UInput v-model="catalogSearch" icon="i-heroicons-magnifying-glass" placeholder="Pesquisar produto ou serviço…" size="xs" class="w-full" />
              </div>
              <div class="max-h-52 overflow-y-auto">
                <div v-if="catalogFiltered.length === 0" class="text-center py-6 text-gray-600 text-xs">
                  Nenhum item no catálogo.
                </div>
                <button
                  v-for="p in catalogFiltered"
                  :key="p.id"
                  class="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0 text-left"
                  @click="addFromCatalog(p)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <UIcon
                      :name="p.type === 'product' ? 'i-heroicons-cube' : 'i-heroicons-wrench'"
                      class="w-3.5 h-3.5 flex-shrink-0"
                      :class="p.type === 'product' ? 'text-blue-400' : 'text-violet-400'"
                    />
                    <div class="min-w-0">
                      <div class="text-sm text-white font-medium truncate">{{ p.name }}</div>
                      <div v-if="p.description" class="text-xs text-gray-500 truncate">{{ p.description }}</div>
                    </div>
                  </div>
                  <div class="text-xs font-mono text-gray-400 flex-shrink-0 ml-3">
                    {{ fmtMoneyCatalog(p.price) }}<span v-if="p.unit" class="text-gray-600">/{{ p.unit }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </UFormField>

        <div class="flex items-center justify-end gap-2 bg-gray-800/50 rounded-lg px-4 py-2.5">
          <span class="text-sm text-gray-400">Total:</span>
          <span class="font-mono font-bold text-white text-lg">{{ fmtMoney(invoiceTotal) }}</span>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Vencimento">
            <UInput v-model="invoiceForm.dueDate" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Status">
            <USelect
              v-model="invoiceForm.status"
              :items="[
                { label: 'Pendente',  value: 'pending' },
                { label: 'Pago',      value: 'paid' },
                { label: 'Vencida',   value: 'overdue' },
                { label: 'Cancelada', value: 'cancelled' },
              ]"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField v-if="invoiceForm.status === 'paid'" label="Data de pagamento">
          <UInput v-model="invoiceForm.paidAt" type="date" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showInvoiceModal = false">Cancelar</UButton>
        <UButton icon="i-heroicons-document-text" :loading="savingInvoice" @click="saveInvoice">
          {{ editingInvoice ? "Salvar" : "Criar fatura" }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- New ticket modal -->
  <UModal v-model:open="showTicketModal" title="Novo ticket de suporte">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Assunto" required>
          <UInput v-model="newTicketForm.subject" placeholder="Descreva o problema ou dúvida" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Mensagem inicial">
          <UTextarea v-model="newTicketForm.message" placeholder="Detalhes adicionais…" :rows="4" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showTicketModal = false">Cancelar</UButton>
        <UButton icon="i-heroicons-plus" :loading="creatingTicket" :disabled="!newTicketForm.subject.trim()" @click="createTicket">
          Criar ticket
        </UButton>
      </div>
    </template>
  </UModal>
</template>
