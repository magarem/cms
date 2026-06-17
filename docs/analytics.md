# Analytics

## Overview

The CMS includes a lightweight, privacy-friendly analytics system. Events are recorded as JSONL (one JSON object per line) in daily log files. No external service is required.

---

## Storage

```
storage/{site}/_analytics/
  2026-06-09.jsonl
  2026-06-10.jsonl
  2026-06-11.jsonl
```

One file per day. Each line is a visit event:

```json
{"ts":1718000000000,"path":"/about","ref":"https://google.com","ua":"Mozilla/5.0...","ip":"1.2.3.4"}
```

---

## Event Fields

| Field | Type | Description |
|-------|------|-------------|
| `ts` | number | Unix timestamp in ms |
| `path` | string | Page path visited |
| `ref` | string | Referrer URL (empty string if none) |
| `ua` | string | User-Agent string |
| `ip` | string | Visitor IP (may be anonymized) |

---

## Query Endpoint

```
GET /sites/:site/analytics?days=30
```

Returns aggregated data for the last N days:

```json
{
  "days": [
    { "date": "2026-06-10", "visits": 142 },
    { "date": "2026-06-11", "visits": 98 }
  ],
  "topPages": [
    { "path": "/", "visits": 210 },
    { "path": "/about", "visits": 87 }
  ],
  "topRefs": [
    { "ref": "https://google.com", "visits": 150 }
  ],
  "devices": {
    "mobile": 180,
    "desktop": 120,
    "tablet": 20
  }
}
```

The API reads and aggregates all JSONL files within the date range. Device detection is done via User-Agent parsing.

---

## Recording Events

Events are written by the **site renderer** (or an edge middleware), not by the CMS UI. The site calls:

```
POST /sites/{site}/analytics
{ "path": "/about", "ref": "https://google.com", "ua": "...", "ip": "..." }
```

Or events may be written directly to the JSONL files by a separate logging layer.

---

## UI — `stats.vue`

Displays:
- **Visits over time** — line or bar chart (last 30 days)
- **Top pages** — ranked list
- **Top referrers** — ranked list
- **Device breakdown** — pie/donut chart
- Date range selector (7d / 30d / 90d)

---

## Privacy Notes

- No cookies required
- IP addresses are stored but can be anonymized (truncate last octet)
- No third-party scripts on the public site
- Data stays on the server (no external analytics service)

---

## `analyticsId` Setting

`_settings.json` has an `analyticsId` field for **external** analytics (Google Analytics, Plausible, etc.) — this is a separate optional integration and does not affect the built-in JSONL system.
