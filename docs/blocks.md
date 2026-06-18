# Block Components

## Overview

The block registry lives at `cms/ui/app/data/components.json` and is the **single source of truth** for what blocks the page editor can render and what props each block accepts. In a page's `_index.yml`, blocks are stored as:

```yaml
blocks:
  - id: "01HXY..."
    componentName: "PageHeader"
    isHero: false
    props:
      title: "Welcome"
      subtitle: "..."
```

At render time the site renderer resolves `componentName` to a Vue file at `sites/shared/components/<Name>.vue`. The CMS uses the same registry to drive the `BlockEditor` and `PropField` inputs.

Each entry exposes:

| Key | Purpose |
|------|---------|
| `name` | Component name — matches `componentName` in saved blocks and the `.vue` filename. |
| `category` | `block` (insertable in the editor) or `layout` (referenced from globals/topbar). |
| `cms_hidden` | When `true`, the block does not appear in the editor's "Add Block" picker. |
| `description` | Shown in the block picker. |
| `props` | Array of prop definitions consumed by `PropField` / `PropForm`. |

---

## Field Types

`PropField` infers an input widget from the prop's `type`. Recognised types:

| Type | Widget |
|------|--------|
| `text` | Single-line string input. |
| `textarea` | Multi-line string input. |
| `markdown` | Full Markdown editor. |
| `number` | Numeric input. |
| `boolean` / `toggle` | Toggle switch. |
| `select` | Dropdown with fixed options. |
| `url` | URL input with link validation. |
| `email` | Email input with format validation. |
| `image` | Media picker — returns image path relative to `media/`. |
| `image-array` | Repeatable image picker (gallery / slides). |
| `video` | Media picker scoped to videos. |
| `media` | Media picker accepting image, video, or audio. |
| `icon` | PrimeIcons class picker (e.g. `pi-bolt`). |
| `date` | Date picker — returns ISO date string. |
| `color` | Color picker — returns hex string. |
| `path` | CMS tree path picker — points at a page/folder under `data/`. |
| `array` | Repeatable list — each item uses `itemSchema`. |
| `object` | Nested group of sub-fields defined by `fields`. |

A prop can additionally declare `required`, `default`, `description`, `group`, and `cms_hidden`. The `group` key bundles related props together in the editor sidebar (e.g. `page-images`).

---

## Page Types

A page's `_index.yml` carries top-level frontmatter (title, layout, SEO, cover image, etc.). The `page_types` registry describes the field set for each layout. Every page type shares the same `seo` object (meta title / description / keywords / OG image / canonical / robots / schema type).

### `default` — Default Page

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `layout` | select | `default` | One of `default` / `post` / `topbar-glass` / `landing`. |
| `description` | textarea | "" | |
| `linkImage` | image | "" | Card thumbnail for listings; falls back to `image`. |
| `image` | image-array | `[]` | Cover image(s). Group: `page-images`. |
| `sideimages` | image-array | `[]` | Group: `page-images`. |
| `sideimages_position` | select | `right` | `right` / `left`. |
| `date` | date | "" | |
| `seo` | object | `{}` | Shared SEO block (see above). Default `schema_type` is `WebPage`. |

### `post` — Post / Article

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `layout` | select | `post` | |
| `author` | text | "" | |
| `date` | date | "" | Publication date. |
| `linkImage` | image | "" | Card thumbnail for listings. |
| `image` | image-array | `[]` | Cover image. |
| `sideimages` | image-array | `[]` | |
| `sideimages_position` | select | `right` | |
| `description` | textarea | "" | |
| `seo` | object | `{}` | Default `schema_type` is `Article`. Options also include `BlogPosting`, `NewsArticle`, `WebPage`. |

### `topbar-glass` — Glass Topbar (Hero)

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `layout` | select | `topbar-glass` | |
| `seo` | object | `{}` | `schema_type` options: `WebPage`, `WebSite`, `AboutPage`. |

### `landing` — Landing Page

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `layout` | select | `landing` | |
| `description` | textarea | "" | |
| `linkImage` | image | "" | |
| `image` | image-array | `[]` | |
| `sideimages` | image-array | `[]` | |
| `sideimages_position` | select | `right` | |
| `seo` | object | `{}` | `schema_type` options: `WebPage`, `WebSite`, `ServicePage`, `AboutPage`. |

---

## Blocks

Blocks are listed alphabetically by component name. Layout-only and `cms_hidden` entries are marked accordingly.

### AppContainer (`AppContainer`) — layout

Wrapper that controls the max-width of its content. Use it to wrap page sections.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `size` | select | `content` | `site` (1440px) / `content` (1200px) / `copy` (800px). |

---

### CallToAction (`CallToAction`)

Call-to-action banner with title, subtitle, and a primary button.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `config` | object | — | Bundles the CTA fields below. |

`config` fields: `title` (text), `subtitle` (textarea), `buttonText` (text, default "Iniciar Projeto"), `buttonLink` (url, default `/contact`).

---

### ChildGrid (`ChildGrid`)

Auto-populated grid that reads child folders from a CMS path and renders them as cards. No manual items needed.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `parentPath` | path | — | Required. Sub-folders of this path become cards. |
| `title` | text | "" | Section title. |
| `subtitle` | text | "" | |
| `titlePosition` | select | `outside` | `outside` (below image) / `inside` (overlay). |
| `cardType` | select | `vertical` | `vertical` (image on top) / `horizontal` (image left). |
| `cardHeight` | select | `auto` | `auto` / `xs` / `sm` / `md` / `lg` / `xl`. |
| `titleAlign` | select | `left` | `left` / `center` / `right`. |
| `buttonText` | text | "Ver mais" | |
| `colsPerRow` | select | `3` | 1 to 6 cards per row. |
| `limit` | number | `0` | `0` = no limit. |
| `showTitle` | boolean | `true` | |
| `showDescription` | boolean | `false` | |
| `showImage` | boolean | `true` | |
| `showButton` | boolean | `true` | |

---

### ContactInfo (`ContactInfo`)

Contact details: WhatsApp, phone, email, and address with icons.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `whatsapp` | text | "" | |
| `phone` | text | "" | |
| `email` | email | "" | |
| `address` | textarea | "" | |
| `layout` | select | `vertical` | `vertical` / `horizontal`. |

---

### ContentBlock (`ContentBlock`)

Two-column section with text content on one side and media on the other. Supports badge, title, body, feature pills, image side control, and video.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `badge` | text | "" | Small tag above the title. |
| `title` | text | "" | Required. |
| `text` | textarea | "" | Body text. |
| `media` | media | "" | Image path or YouTube/Vimeo URL. Videos open in a lightbox. |
| `imageSide` | select | `right` | `right` / `left`. |
| `features` | array | `[]` | Each item: `{ icon, label }`. |
| `pagePath` | path | "" | Hidden — wired by the editor. |

---

### ContentMD (`ContentMD`)

Renders a Markdown file from the CMS with optional top image and side images.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `pagePath` | path | — | Required. Folder under `data/` containing `content.md` (e.g. `services/consultoria`). |

---

### Curriculum (`Curriculum`)

Numbered module/curriculum grid with an optional CTA banner at the bottom.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `subtitle` | text | "" | |
| `modules` | array (string list) | `[]` | One module name per item. |
| `ctaTitle` | text | "" | |
| `ctaText` | textarea | "" | |
| `ctaLabel` | text | "" | Empty hides the CTA banner. |
| `ctaLink` | url | `/inscricao` | |

---

### CustomerReviews (`CustomerReviews`)

Showcase of customer reviews/testimonials in a grid or carousel.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "O que os nossos clientes dizem" | |
| `subtitle` | text | "Testemunhos" | |
| `description` | textarea | "" | |
| `layout` | select | `grid` | `grid` / `carousel`. |
| `columns` | select | `3` | 1 to 4. |
| `limit` | number | `6` | `0` = all. |
| `showRating` | boolean | `true` | Global rating summary. |
| `autoplay` | boolean | `false` | Carousel only. |
| `autoplayDelay` | number | `5000` | ms. |
| `reviews` | array | `[]` | See item shape below. |

`reviews` item: `{ name, role, stars (1-5), text, avatar (image), video (url), source (`google` / `facebook` / `trustpilot` / `tripadvisor`), date, verified }`.

---

### FaqList (`FaqList`)

Frequently asked questions in an accordion or card grid.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Perguntas Frequentes" | |
| `subtitle` | text | "FAQ" | |
| `description` | textarea | "" | |
| `layout` | select | `accordion` | `accordion` / `grid`. |
| `columns` | select | `1` | 1 / 2 / 3 (3 only in grid mode). |
| `allowMultiple` | boolean | `false` | Accordion mode only. |
| `items` | array | `[]` | Each item: `{ question, answer }`. |

---

### FeatureGrid (`FeatureGrid`)

Feature / benefit grid with icon, title, and description. Supports `cards`, `minimal`, and `icon-left` variants.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Porque nos escolher" | |
| `subtitle` | text | "Vantagens" | |
| `description` | textarea | "" | |
| `columns` | select | `3` | 2 / 3 / 4. |
| `variant` | select | `cards` | `cards` / `minimal` / `icon-left`. |
| `background` | select | `default` | `default` / `muted`. |
| `items` | array | `[]` | Each item: `{ icon (PrimeIcons), title, description, badge }`. |

---

### FooterLogoBrand (`FooterLogoBrand`) — layout, cms-hidden

Footer brand block: site name, slogan, short description, and social links.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `logo` | image | "" | If set, replaces the brand name text. |
| `logoHeight` | text | `60px` | CSS height. |
| `brandName` | text | "" | |
| `slogan` | text | "" | |
| `description` | textarea | "" | |
| `socialLinks` | array | `[]` | Each item: `{ platform, url, label }`. |

`platform` is one of `instagram` / `facebook` / `youtube` / `linkedin` / `twitter` / `tiktok` / `whatsapp` / `github`.

---

### Hero (`Hero`)

Full-screen hero section with video background, title, description, and dual CTA buttons.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `badge` | text | "" | Small badge above the title. |
| `title` | text | "" | Required. |
| `description` | textarea | "" | |
| `image` | image | "" | Fallback image if the video fails to load. |
| `video` | video | "" | Background MP4 URL. |
| `btnLabel` | text | "Learn More" | Primary button. |
| `btnLink` | url | `/inscricao` | |
| `ctaLabel` | text | "Comprar Agora" | Empty hides the CTA button. |
| `ctaLink` | url | "" | Purchase / checkout URL. |

---

### HeroSlideShow (`HeroSlideShow`)

Full-screen hero with auto-playing image/video slideshow, gradient overlay, badge, split title, description, and dual CTAs.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `badge` | text | "" | |
| `badgeIcon` | icon | "" | |
| `titlePrefix` | text | "" | Normal part of the title. |
| `titleHighlight` | text | "" | Rendered in the primary brand color. |
| `description` | textarea | "" | |
| `slides` | image-array | `[]` | Slideshow media (images or videos). |
| `slideDuration` | number | `5` | Seconds per slide. |
| `cWidth` | select | `content` | `site` / `content`. |
| `btnLabel` | text | "Saber Mais" | |
| `btnLink` | url | "" | |
| `ctaLabel` | text | "Comprar Agora" | Empty hides the button. |
| `ctaLink` | url | "" | |

---

### InscricaoForm (`InscricaoForm`)

3-step enrolment form (exclusive to the Paravyoma Yoga site). All copy, prices, and payment methods are editable. Sourced from `paravyoma2/app/components/InscricaoForm.vue`.

The component has many text-override props. They fall into a few groups:

**Header**

| Field | Type | Default |
|------|------|---------|
| `badgeText` | text | "Formação Profissional 2026" |
| `badgeIcon` | text | `pi-star-fill` |
| `title` | text | "Inscrição em Yogaterapia" |
| `subtitle` | text | "Preencha o formulário abaixo para garantir a sua vaga." |

**Step indicator** — `stepLabel` ("Passo"), `stepOfLabel` ("de").

**Step 1 — Personal data:** `step1Title`, `nomeLabel`/`nomePlaceholder`, `emailLabel`/`emailPlaceholder`, `whatsappLabel`/`whatsappPlaceholder`.

**Step 2 — Complementary data:** `step2Title`, `nascimentoLabel`, `cpfLabel`/`cpfPlaceholder`, `enderecoLabel`/`enderecoPlaceholder`.

**Step 3 — Payment**

| Field | Type | Notes |
|------|------|-------|
| `step3Title` | text | "Método de pagamento" |
| `pricingRows` | array | Items: `{ label, value, style (normal / strikethrough / highlight) }`. |
| `promoText` | markdown | Block below the price box. |
| `paymentOptions` | array | Items: `{ id, label, detalhe }`. |
| `defaultPaymentMethod` | text | Default option id (e.g. `pix`). |

**Navigation buttons:** `nextLabel`, `backLabel`, `submitLabel`, `submittingLabel`.

**Error messages:** `errNomeRequired`, `errEmailRequired`, `errWhatsappRequired`, `errGeneric`.

**Success screen:** `successTitle`, `successMessage` (textarea), `successButtonLabel`, `successButtonLink` (url).

**Footer:** `reassuranceText`.

---

### Instructor (`Instructor`)

Instructor/author profile section with photo, bio, credentials list, and an optional footer badge.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `label` | text | "Seu Instrutor" | Small label above the name. |
| `name` | text | "" | Required. |
| `image` | image | "" | Photo. |
| `bio` | textarea | "" | Rendered as a styled blockquote. |
| `credentials` | array (string list) | `[]` | Bullet points shown with a decorative icon. |
| `footerBadge` | text | "" | Below the credentials. |
| `footerSubtitle` | text | "" | Italic subtitle next to the badge. |
| `pagePath` | path | "" | Hidden — wired by the editor. |

---

### MediaGallery (`MediaGallery`)

Gallery of images and videos rendered as a grid, masonry, carousel, or Instagram-style layout, with lightbox, filters, and captions.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Galeria" | |
| `subtitle` | text | "" | |
| `description` | textarea | "" | |
| `layout` | select | `grid` | `grid` / `masonry` / `carousel` / `instagram`. |
| `columns` | number | `3` | 2 to 5. |
| `gap` | select | `md` | `none` / `sm` / `md` / `lg`. |
| `aspectRatio` | select | `square` | `square` / `landscape` / `portrait` / `auto` (grid layout). |
| `showCaption` | boolean | `true` | |
| `captionStyle` | select | `hover` | `hover` / `always` / `below`. |
| `lightbox` | boolean | `true` | |
| `showFilter` | boolean | `false` | Category filter bar. |
| `limitVisible` | number | `0` | `0` = show all. |
| `items` | array | `[]` | Supports Instagram and folder import. |

`items` item: `{ src (image or video URL), type (image / video), title, description, category, alt }`.

---

### Menu (`Menu`) — layout, cms-hidden

Navigation menu — horizontal or vertical list of links.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `type` | select | `horizontal` | `horizontal` / `vertical`. |
| `items` | array | `[]` | Each item: `{ label, link, newpage }`. |

---

### MercadoLivreShop (`MercadoLivreShop`)

Catalogue of Mercado Livre products. Use a social-shop URL (`/social/<user>`) to auto-import the affiliate list, or paste individual product URLs.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `description` | textarea | "" | |
| `socialUrl` | url | "" | When set, imports the affiliate list and ignores `products`. |
| `showPrice` | toggle | `true` | |
| `showBadge` | toggle | `true` | `MAIS VENDIDO`, etc. |
| `showShipping` | toggle | `true` | "Frete grátis" info. |
| `columns` | select | `3` | 2 / 3 / 4. |
| `ctaText` | text | "Ver no Mercado Livre" | |
| `products` | array | `[]` | Used only when `socialUrl` is empty. |

`products` item: `{ mercadolivreUrl, active }`.

---

### MultiImageBanner (`MultiImageBanner`)

Photo mosaic banner — the first image is the hero, up to 4 smaller images sit beside it. Click opens a lightbox slideshow.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `images` | image-array | — | Required. First image is the highlight (up to 5). |
| `cWidth` | select | `content` | `full` / `site` / `content`. |
| `height` | select | `horizontal` | `horizontal` (55vh) / `full` (100vh). |
| `linkPath` | url | — | If set, the banner links instead of zooming. |

---

### NewsletterSubscribe (`NewsletterSubscribe`) — layout

Newsletter subscription box with title, subtitle, and email input.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Subscreva a nossa newsletter" | |
| `subtitle` | textarea | "Receba as novidades…" | |
| `buttonText` | text | "Subscrever" | |
| `actionUrl` | url | "" | POST target. |

---

### PageHeader (`PageHeader`)

Page or section heading with optional tag, highlighted word, and subtitle.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Required. |
| `highlight` | text | "" | Word inside the title to highlight. |
| `subtitle` | textarea | "" | |
| `tag` | text | "" | Small badge above the title. |
| `tagIcon` | icon | "" | |
| `cWidth` | select | `content` | `site` / `content` / `copy`. |
| `BoxAlign` | select | `center` | `left` / `center` / `right`. |

---

### PriceList (`PriceList`)

List of items with prices organised by categories — restaurant menus, product catalogues, service tables.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Menu" | |
| `subtitle` | text | "" | |
| `description` | textarea | "" | |
| `currency` | text | `€` | |
| `pricePosition` | select | `after` | `after` / `before`. |
| `layout` | select | `list` | `list` / `compact` / `grid`. |
| `columns` | select | `2` | 1 / 2 / 3. |
| `showImages` | boolean | `true` | |
| `categories` | array | `[]` | See item shape below. |

`categories` item: `{ name, description, icon, items[] }`.

`items` (nested) item: `{ name, description, price, image, badge (e.g. Popular, Veg, Novo, Chef, Picante), featured (bool), available (bool) }`.

---

### ProductShop (`ProductShop`)

Product grid for shops and e-commerce — supports category filters, search, sale prices, and stock state.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Loja" | |
| `subtitle` | text | "" | |
| `description` | textarea | "" | |
| `currency` | text | `€` | |
| `pricePosition` | select | `after` | `after` / `before`. |
| `layout` | select | `grid` | `grid` / `list`. |
| `columns` | select | `3` | 2 / 3 / 4. |
| `showFilters` | boolean | `true` | Category filter bar. |
| `showSearch` | boolean | `true` | |
| `showBuyButton` | toggle | `true` | |
| `ctaLink` | url | "" | Fallback purchase link. |
| `ctaLabel` | text | "Comprar" | |
| `ctaTarget` | select | `_self` | `_self` / `_blank`. |
| `products` | array | `[]` | See item shape below. |

`products` item: `{ name, description, price, oldPrice, image, category, link, badge (Novo / Promoção / Destaque / Exclusivo / Esgotado), available }`.

---

### QuickNavigation (`QuickNavigation`)

Row of feature/navigation cards with icon, title, description, and CTA link.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `links` | array | `[]` | See item shape below. |
| `colsPerRow` | select | `3` | 1 to 6. |
| `showIcons` | toggle | `true` | |
| `showLinkText` | toggle | `true` | |
| `cWidth` | select | `w-full` | `site` / `content` / `article`. |

`links` item: `{ icon, title, description, ctaText, to (card URL), ctaLink (button URL override) }`.

---

### Sirius-ContactModel1 (`Sirius-ContactModel1`)

Contact page layout with an info column and a dynamic form builder.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `formTitle` | text | "Envia-nos uma mensagem" | |
| `contactInfo` | array | — | Required. Each item: `{ icon, label, value, href }`. |
| `formSchema` | array | — | Required. Each item: `{ name (field key), label, type (`text` / `email` / `textarea` / `number` / `tel`), placeholder, required }`. |
| `submitConfig` | object | — | Required. Fields: `label`, `icon`, `terms`. |
| `successConfig` | object | — | Required. Fields: `title`, `message`, `icon` (default `pi-check`), `buttonLabel`. |

---

### SiteHeader (`SiteHeader`) — layout, cms-hidden

Main site header / topbar. Config driven by `_global/_topbar.json` — not a page block.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `isGlass` | boolean | `false` | Transparent mode over hero. |

---

### SiteHeaderExtra (`SiteHeaderExtra`) — layout

Header extras: theme toggle, CTA button, WhatsApp / phone icons.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `align` | select | `right` | `left` / `center` / `right`. |
| `showDarkToggle` | boolean | `true` | |
| `ctaShow` | boolean | `true` | |
| `ctaLabel` | text | "Começar" | |
| `ctaLink` | url | "" | Empty = no link. |
| `ctaNewTab` | boolean | `false` | |
| `ctaStyle` | select | `filled` | `filled` / `outline`. |
| `whatsapp` | text | "" | Country code + digits only, e.g. `351912345678`. |
| `phone` | text | "" | E.g. `+351 912 345 678`. |
| `showContactOnMobile` | boolean | `false` | Contact icons are hidden on mobile by default. |

---

### SiteHeaderLogo (`SiteHeaderLogo`) — layout

Logo / brand mark — usable standalone in the footer or any block area.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `brandName` | text | "SIRIUS" | |
| `signature` | text | "STUDIO" | Tagline below the name. |
| `image` | image | "" | Fallback logo image. |
| `imageDark` | image | "" | Dark-mode override. |
| `imageLight` | image | "" | Light-mode override. |
| `logoPadding` | number | `20` | Vertical padding %; `0` = full topbar height. |
| `align` | select | `left` | `left` / `center` / `right`. |
| `variation` | select | `signature` | `signature` / `icon-text` / `pill` / `stacked` / `minimal`. |
| `logoFont` | select | `var(--font-serif)` | Theme defaults plus ~30 Google fonts (Inter, Roboto, Playfair Display, etc.). |
| `logoFontSize` | text | "" | CSS size, e.g. `2rem`, `32px`. |

---

### SiteHeaderMenu (`SiteHeaderMenu`) — layout

Navigation menu inside `SiteHeader`. Menu items come from `_topbar.json`.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `align` | select | `center` | `left` / `center` / `right`. |
| `menuFont` | select | `var(--font-sans)` | Same font roster as `SiteHeaderLogo`. |
| `menuFontSize` | text | "" | CSS size. |
| `menuItems` | array | `[]` | Each item: `{ label, path }`. |

---

### SocialLinks (`SocialLinks`) — layout

Social-media icon links with title, subtitle, and horizontal/vertical layout.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `subtitle` | textarea | "" | |
| `layout` | select | `horizontal` | `horizontal` (icons) / `vertical` (icon + name). |
| `items` | array | `[]` | Each item: `{ platform, url, label }`. |

`platform`: `instagram` / `facebook` / `youtube` / `linkedin` / `twitter` / `tiktok` / `whatsapp` / `github` / `pinterest` / `telegram` / `discord` / `reddit`.

---

### SocialProof (`SocialProof`)

Scrolling logo marquee strip for brand / client logos.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Empresas que confiam em nós" | |
| `logos` | array | `[]` | Each item: `{ type (text / image), name, url (image path) }`. |
| `cWidth` | select | `w-full` | `w-full` / `cw-1` (900px). |

---

### StatsBar (`StatsBar`)

Animated stats bar with counters. Ideal for highlighting headline numbers (clients, years of experience, projects, etc.).

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `subtitle` | text | "" | |
| `variant` | select | `horizontal` | `horizontal` / `centered` / `minimal`. |
| `background` | select | `muted` | `default` / `muted` / `primary` / `dark`. |
| `dividers` | toggle | `true` | |
| `animate` | toggle | `true` | |
| `duration` | number | `2000` | Animation duration in ms. |
| `items` | array | `[]` | Each item: `{ value, prefix, suffix, label, description, icon }`. |

---

### Team (`Team`)

Team showcase with photo, name, role, bio, and social links. Variants: `cards`, `minimal`, `list`.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "Conheça a nossa equipa" | |
| `subtitle` | text | "Equipa" | |
| `description` | textarea | "" | |
| `columns` | select | `3` | 2 / 3 / 4. |
| `variant` | select | `cards` | `cards` / `minimal` / `list`. |
| `background` | select | `default` | `default` / `muted`. |
| `showSocial` | toggle | `true` | |
| `showBio` | toggle | `true` | |
| `members` | array | `[]` | See item shape below. |

`members` item: `{ name, role, bio, avatar (image), email, linkedin, instagram, twitter, facebook }`.

---

### Textbox (`Textbox`)

Content block with title, subtitle, image gallery, and rich-text body.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `subtitle` | text | "" | |
| `images` | image-array | `[]` | |
| `body` | markdown | "" | |
| `size` | select | `md` | `sm` (560px) / `md` (800px) / `lg` (1100px) / `full` (100%). |
| `maxWidth` | text | "" | Overrides `size`, e.g. `720px`, `60ch`. |
| `align` | select | `left` | `left` / `center` / `right`. |

---

### AccommodationsGrid (`AccommodationsGrid`)

Room and suite grid for boutique hotels and pousadas — photo carousel per card, amenities with icons, highlight price, and a WhatsApp or external booking button.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Section title. |
| `subtitle` | text | "" | |
| `cWidth` | select | `content` | `site` / `content` / `copy`. |
| `rooms` | array | `[]` | See item shape below. |

`rooms` item: `{ name, description, images (image-array), amenities (string list), priceFrom, currency (ISO code, e.g. `BRL`), maxGuests, bedType, size, whatsappNumber, bookingUrl }`.

`bookingUrl` takes priority over `whatsappNumber`. If both are empty the button is hidden.

---

### BookingWidget (`BookingWidget`)

Compact booking bar for boutique hotels — check-in, check-out, and number of guests fields with a single CTA that sends via WhatsApp or an external booking URL.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Heading above the bar. |
| `subtitle` | text | "" | |
| `checkInLabel` | text | `Check-in` | |
| `checkOutLabel` | text | `Check-out` | |
| `guestsLabel` | text | `Hóspedes` | |
| `ctaLabel` | text | `Ver disponibilidade` | |
| `whatsappNumber` | text | "" | If set, opens WhatsApp with a pre-filled message. |
| `bookingUrl` | text | "" | External booking URL — takes priority over `whatsappNumber`. |
| `cWidth` | select | `content` | `site` / `content`. |

---

### ExperienceCards (`ExperienceCards`)

Grid of experience cards with a full-bleed image, gradient overlay, optional PrimeIcons icon, and an optional link — ideal for activities, guided tours, and local attractions.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Section title. |
| `subtitle` | text | "" | |
| `cols` | select | `3` | Number of columns (1–6). |
| `cWidth` | select | `content` | `site` / `content`. |
| `experiences` | array | `[]` | See item shape below. |

`experiences` item: `{ title, description, image (image), icon (PrimeIcons class, e.g. `pi-sun`), link (internal path or full URL) }`.

---

### InstagramFeed (`InstagramFeed`)

Instagram feed — shows the most recent posts via Instagram Graph API with a hover overlay and caption. Requires an access token configured in CMS Settings → Instagram.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | `Instagram` | Section title. |
| `subtitle` | text | "" | |
| `username` | text | "" | Display handle (e.g. `@pousada`). Not used for the API call — cosmetic only. |
| `limit` | select | `9` | Number of posts to show (3 / 6 / 9 / 12). |
| `cols` | select | `3` | Grid columns (2 / 3 / 4). |
| `cWidth` | select | `content` | `site` / `content`. |

Shows a placeholder card when no token is configured.

---

### MapSection (`MapSection`)

Embedded map section (Google Maps iframe) with title, description, and a list of highlighted points of interest shown beside the map.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Section title. |
| `description` | text | "" | Short paragraph next to the map. |
| `embedUrl` | text | "" | Google Maps embed URL (use "Share → Embed a map" in Google Maps). |
| `height` | text | `420px` | CSS height of the iframe. |
| `cWidth` | select | `content` | `site` / `content`. |
| `highlights` | array | `[]` | See item shape below. |

`highlights` item: `{ name, description, icon (PrimeIcons class, default `pi-map-marker`) }`.

---

### ReservationForm (`ReservationForm`)

Contact / reservation form for boutique hotels and pousadas — configurable check-in/out, guests, and phone fields. Submission can go via WhatsApp, email (Resend), or both.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | `Faça a sua reserva` | |
| `subtitle` | text | "" | |
| `description` | text | "" | Short paragraph above the form. |
| `whatsappNumber` | text | "" | Required for `whatsapp` or `both` submit modes. |
| `emailTo` | text | "" | Required for `email` or `both` submit modes. |
| `submitMode` | select | `whatsapp` | `whatsapp` / `email` / `both`. |
| `showCheckInOut` | toggle | `true` | Show check-in / check-out date fields. |
| `showGuests` | toggle | `true` | Show number of guests field. |
| `showPhone` | toggle | `true` | Show phone / WhatsApp field. |
| `successMessage` | text | `Mensagem enviada! Entraremos em contacto em breve.` | |
| `cWidth` | select | `content` | `site` / `content`. |

---

### TestimonialsCarousel (`TestimonialsCarousel`)

Guest testimonial carousel — displays one card at a time with a star rating, quote, author name, photo, origin, and date. Configurable autoplay with navigation arrows and dot indicators.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | Section title. |
| `subtitle` | text | "" | |
| `autoplay` | toggle | `true` | Advances automatically. |
| `cWidth` | select | `content` | `site` / `content`. |
| `testimonials` | array | `[]` | See item shape below. |

`testimonials` item: `{ text, name, photo (image), origin, date }`.

---

### VideosShowcase (`VideosShowcase`)

Testimonial-video showcase in a grid (3 per row) or horizontal carousel. File is `components/Depoimentos.vue`.

| Field | Type | Default | Notes |
|------|------|---------|-------|
| `title` | text | "" | |
| `subtitle` | textarea | "" | |
| `layout` | select | `grid` | `grid` / `scroll`. |
| `playerOrientation` | select | `horizontal` | `horizontal` (16:9) / `vertical` (9:16 — Shorts). |
| `zoomOnClick` | toggle | `false` | Shows a thumbnail with a play button that opens the video full-screen. |
| `videos` | array | `[]` | Each item: `{ videoId (YouTube ID), name, label }`. |

---

## Notes for Renderers

- Components live under `sites/shared/components/<Name>.vue` and are referenced by `componentName`. `InscricaoForm` is the only block whose source lives in a site-specific tree (`paravyoma2/app/components/InscricaoForm.vue`).
- Media values are stored as paths **relative to** `storage/{site}/{version}/media/` — the site renderer resolves them via `/api/media?path=...`.
- `path` props point at folders inside `data/` and are resolved by the renderer to load `_index.yml` or child folders.
- `cms_hidden: true` on a block or prop hides it from the editor UI but keeps it available to the renderer.
- The `_meta` block in `components.json` (version + `fieldTypes` dictionary) is metadata for tooling and is not consumed by the renderer.
