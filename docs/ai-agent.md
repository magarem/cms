# AI Agent (Content Generation)

## Overview

The AI agent generates complete page content — blocks, props, text, and images — from a natural language prompt. It uses **Anthropic Claude** for content and **Pexels** for stock photos.

---

## Endpoint

```
POST /sites/:site/agent/generate
{
  "prompt": "Create a landing page for a yoga studio called Paz Interior",
  "dryRun": false,
  "model": "claude-opus-4-7"
}
```

- Admin (or editor) only
- `dryRun: true` returns the generated spec without writing any files
- `model` defaults to the latest Claude Sonnet if not specified

---

## Generation Flow

```
1. Fetch component registry (GET /sites/:site/components)
2. Fetch existing page tree (GET /sites/:site/tree)
3. Build system prompt with:
   - Available component schemas (prop names, types, descriptions)
   - Current site structure
   - Instructions to produce a structured JSON spec
4. Send to Claude API with user prompt
5. Parse response → array of PageSpec objects
6. For each page in spec:
   a. Fetch Pexels images (if image props are needed)
   b. Download and upload images to /sites/:site/media/upload
   c. Apply model (if specified) to set block IDs and pagePaths
   d. POST /sites/:site/page to create each page
7. Return summary of created pages
```

---

## PageSpec Format

Claude is instructed to return:

```json
[
  {
    "path": "about",
    "title": "Sobre nós",
    "model": "normal-page",
    "blocks": [
      {
        "componentName": "HeroSection",
        "isHero": true,
        "props": {
          "heading": "Somos a Paz Interior",
          "image": "__pexels:yoga meditation calm__"
        }
      },
      {
        "componentName": "ContentMD",
        "props": {
          "pagePath": "about"
        }
      }
    ],
    "markdown": "# Sobre nós\n\nSomos um estúdio de yoga..."
  }
]
```

Image props containing `__pexels:{query}__` are replaced with real Pexels images before writing.

---

## Pexels Integration

When a prop value matches `__pexels:{search query}__`:
1. Call Pexels API: `GET https://api.pexels.com/v1/search?query={query}&per_page=5`
2. Pick the best-fit image
3. Download the image file
4. Upload to the site via `POST /sites/:site/media/upload`
5. Replace the placeholder with the uploaded media path

Requires `PEXELS_API_KEY` env var.

---

## `apply-spec` Batch Endpoint

For batch creation from a pre-built spec (used internally or by external tools):

```
POST /sites/:site/apply-spec
{ "pages": [ PageSpec, ... ] }
```

Iterates pages, applies models, creates each page. Useful for seeding content programmatically.

---

## UI — `assistant.vue`

- Text area for the generation prompt
- Model selector (Claude Sonnet / Opus)
- "Dry run" toggle (preview without writing)
- Progress indicator during generation
- Result: list of created pages with links

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required for Claude API calls |
| `PEXELS_API_KEY` | Required for stock image search |

---

## Instagram Import

A related utility endpoint fetches a public Instagram profile's recent posts for content inspiration:

```
GET /sites/:site/instagram-import?username=yogaestudio
→ { posts: [{ image, caption, url }] }
```

Results are shown in the assistant UI as image/text inspiration cards.
