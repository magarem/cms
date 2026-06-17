# Newsletter & Form Submissions

## Overview

The CMS provides simple storage and management for two types of user-submitted data: newsletter subscribers and form submissions (registrations/inscriptions).

---

## Newsletter

### Storage
```
storage/{site}/_newsletter/
  subscribers.json
```

```json
[
  {
    "email": "user@example.com",
    "subscribedAt": "2026-06-01T10:00:00.000Z",
    "name": "Maria Silva"
  }
]
```

### API Endpoints

#### List subscribers
```
GET /sites/:site/newsletter
→ { subscribers: [...] }
```

#### Delete subscriber
```
DELETE /sites/:site/newsletter?email=user@example.com
```
Admin only.

### Subscribing (public)

New subscribers are added by the **site renderer** or a form handler, not directly by the CMS UI. A public-facing endpoint (outside the auth guard) accepts:
```
POST /sites/:site/newsletter/subscribe
{ "email": "user@example.com", "name": "Maria" }
```

### UI — `newsletter.vue`

- Table of all subscribers (email, name, date)
- Search/filter
- Export as CSV button
- Delete individual subscriber

---

## Form Submissions (Inscrições)

### Storage
```
storage/{site}/_inscricoes/
  inscricoes.json
```

```json
[
  {
    "id": "uuid-v4",
    "submittedAt": "2026-06-10T14:30:00.000Z",
    "name": "João Costa",
    "email": "joao@example.com",
    "phone": "+351 912 345 678",
    "message": "Gostaria de saber mais sobre...",
    "formId": "contact"
  }
]
```

The schema is flexible — any fields submitted by the form are stored.

### API Endpoints

#### List submissions
```
GET /sites/:site/inscricoes
→ { inscricoes: [...] }
```

#### Delete submission
```
DELETE /sites/:site/inscricoes?id=uuid-v4
```
Admin only.

### Submitting (public)

Form submissions come from the site renderer's contact/registration forms:
```
POST /sites/:site/inscricoes
{ "name": "...", "email": "...", "formId": "contact", ...anyFields }
```

### UI — `inscricoes.vue`

Route `/[site]/inscricoes`, layout `cms`. Built around a single table with row-click → detail modal.

**Topbar**
- Breadcrumb shows "Inscrições" with a count badge of total submissions
- Action: **Exportar CSV** (disabled when list is empty)

**Search bar** — filters by `nome`, `email`, or `whatsapp` (case-insensitive substring on the loaded list).

**Table columns** (responsive — some hidden on smaller breakpoints)

| Column | Source field | Shown at |
|--------|--------------|----------|
| Nome | `nome` (with initial-avatar) | always |
| Contacto | `email`, `whatsapp` | always |
| Dados pessoais | `nascimento` (formatted `dd/mm/yyyy`), `cpf` | `lg` and up |
| Endereço | `endereco` | `xl` and up |
| Pagamento | `metodoPagamento` as badge (PIX = success, Cartão = info, Boleto = neutral) | always |
| Inscrito em | `inscritoEm` (formatted pt-PT) | `md` and up |
| Actions | trash icon | always |

Clicking a row opens the detail modal; clicking the trash icon opens the delete confirmation directly.

**Detail modal**
- Header: avatar (first initial), full name, internal `id` (monospaced)
- Two-column `<dl>` of all fields (Email, WhatsApp, Nascimento, CPF, Endereço, Pagamento, Inscrito em)
- Footer: "Eliminar" (left) chains into the delete confirmation; "Fechar" (right) dismisses

**Delete confirmation** — irreversible delete, toasts on success/error, refreshes the list.

**CSV export** — columns: `Nome, Email, WhatsApp, Nascimento, CPF, Endereço, Pagamento, Data de inscrição`. UTF-8 BOM prepended for Excel compatibility. Filename `inscricoes-{site}-{YYYY-MM-DD}.csv`.

**Payment method labels**
```ts
{ pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto' }
```

---

## Data Retention

There is no automatic purge. Data accumulates until manually deleted via the CMS UI or API. For GDPR compliance, regularly review and purge old data.
