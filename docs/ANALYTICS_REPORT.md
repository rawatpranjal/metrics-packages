# Tech-Econ Analytics System Report

**Date**: December 31, 2025
**Status**: Fully Operational
**Author**: Claude Code

---

## Executive Summary

Tech-econ.com has a complete, privacy-respecting analytics system that tracks user interactions across the site. The system uses Cloudflare's edge infrastructure (Workers + D1 database) for low-latency, globally distributed analytics collection and querying.

**Key Metrics Available**:
- Page views and unique sessions
- Content clicks and impressions
- Search queries
- User engagement (time on page, scroll depth)
- Core Web Vitals (LCP, FID, CLS)
- Geographic distribution
- JavaScript errors

**Current Data Volume**:
- ~4,500 historical events migrated from KV
- ~1,000 events/day expected
- ~55 MB/year storage growth
- 90+ years until D1 free tier limit (5GB)

---

## 1. System Architecture

### 1.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  tracker.js                                                      │    │
│  │  - Loaded on every page via baseof.html                         │    │
│  │  - Captures: pageviews, clicks, impressions, search, vitals     │    │
│  │  - Batches events (10 max or 30s interval)                      │    │
│  │  - Sends via fetch() or sendBeacon() on page exit               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ POST /events
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  tech-econ-analytics Worker                                      │    │
│  │  URL: https://tech-econ-analytics.rawat-pranjal010.workers.dev  │    │
│  │                                                                  │    │
│  │  Responsibilities:                                               │    │
│  │  - CORS validation (only allowed origins)                       │    │
│  │  - Rate limiting (60 req/min per IP)                            │    │
│  │  - Payload validation (50 events, 50KB max)                     │    │
│  │  - Event storage and aggregation                                │    │
│  │  - API endpoints for querying                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                    │                           │
│                         ▼                    ▼                           │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │  D1 Database (Primary)   │  │  KV Namespace (Backup)   │            │
│  │  tech-econ-analytics-db  │  │  ANALYTICS_EVENTS        │            │
│  │  - Raw events (forever)  │  │  - 30-day TTL            │            │
│  │  - Aggregated stats      │  │  - Legacy fallback       │            │
│  │  - Cache layer           │  │                          │            │
│  └──────────────────────────┘  └──────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Locations

| Component | Path | Purpose |
|-----------|------|---------|
| Client Tracker | `/static/js/tracker.js` | Browser-side event capture |
| Worker | `/analytics-worker/index.js` | API + storage logic |
| Schema | `/analytics-worker/schema.sql` | D1 table definitions |
| Config | `/analytics-worker/wrangler.toml` | Cloudflare bindings |
| CI/CD | `/.github/workflows/deploy-worker.yml` | Auto-deploy on changes |
| Docs | `/analytics-worker/README.md` | Technical documentation |

### 1.3 External Dependencies

| Service | Purpose | Tier |
|---------|---------|------|
| Cloudflare Workers | Serverless compute | Free (100k req/day) |
| Cloudflare D1 | SQLite database | Free (5GB, 5M reads/day) |
| Cloudflare KV | Key-value backup | Free (100k reads/day) |
| GitHub Actions | CI/CD | Free |
| GitHub Pages | Site hosting | Free |

---

## 2. Data Collection

### 2.1 Events Tracked

#### Pageview
Fired once per page load.
```javascript
{
  t: "pageview",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    path: "/packages",
    ref: "abc123"  // hashed referrer
  }
}
```

#### Click
Fired on link and card clicks.
```javascript
{
  t: "click",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    type: "card",        // or "internal", "external"
    name: "pandas",      // from data-name attribute
    section: "packages", // from data-section or URL
    category: "Python"   // from data-category
  }
}
```

#### Impression
Fired when content is 50% visible for the first time in a session.
```javascript
{
  t: "impression",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    name: "pandas",
    section: "packages",
    category: "Python"
  }
}
```

#### Search
Fired 1 second after user stops typing in search input.
```javascript
{
  t: "search",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    q: "causal inference",
    src: "main-search"
  }
}
```

#### Engage
Fired when user leaves the page.
```javascript
{
  t: "engage",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    timeOnPage: 45,      // seconds (visible time only)
    scrollDepth: 75,     // percentage
    interactions: 3      // click count
  }
}
```

#### Vitals
Core Web Vitals, fired automatically by browser APIs.
```javascript
{
  t: "vitals",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    metric: "LCP",       // or "FID", "CLS"
    value: 1200,         // milliseconds (or score for CLS)
    rating: "good"       // "good", "needs-improvement", "poor"
  }
}
```

#### Error
JavaScript errors and unhandled promise rejections.
```javascript
{
  t: "error",
  ts: 1735600000000,
  sid: "m1abc123xyz",
  p: "/packages",
  d: {
    msg: "Cannot read property 'foo' of undefined",
    file: "abc123",      // hashed filename
    line: 42
  }
}
```

### 2.2 Data NOT Collected

| Data | Why Not |
|------|---------|
| IP addresses | Hashed only for rate limiting, not stored |
| Cookies | Uses sessionStorage instead |
| User IDs | Anonymous session IDs only |
| Full referrer URLs | Hashed for privacy |
| Form inputs | Only search queries tracked |
| Scroll position | Only max depth percentage |

### 2.3 Privacy Compliance

| Requirement | Implementation |
|-------------|----------------|
| Do Not Track | Respected - tracking disabled if `navigator.doNotTrack === '1'` |
| Session isolation | sessionStorage cleared on tab close |
| Data minimization | Only essential data collected |
| No fingerprinting | No canvas, fonts, or hardware data |
| Anonymization | Referrers and filenames hashed |

---

## 3. Database Schema

### 3.1 Tables

```sql
-- Raw events (kept forever)
events (
    id INTEGER PRIMARY KEY,
    type TEXT,           -- pageview, click, search, etc.
    session_id TEXT,
    path TEXT,
    timestamp INTEGER,   -- Unix ms
    country TEXT,
    data TEXT,           -- JSON payload
    created_at DATETIME
)

-- Daily aggregates
daily_stats (
    date TEXT PRIMARY KEY,  -- YYYY-MM-DD
    pageviews INTEGER,
    unique_sessions INTEGER,
    clicks INTEGER,
    searches INTEGER,
    avg_time_on_page REAL
)

-- Hourly breakdown
hourly_stats (
    hour_bucket TEXT PRIMARY KEY,  -- YYYY-MM-DD-HH
    pageviews INTEGER,
    unique_sessions INTEGER,
    clicks INTEGER
)

-- Content click leaderboard
content_clicks (
    id INTEGER PRIMARY KEY,
    name TEXT,
    section TEXT,
    category TEXT,
    click_count INTEGER,
    first_clicked DATETIME,
    last_clicked DATETIME,
    UNIQUE(name, section)
)

-- Content impression leaderboard
content_impressions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    section TEXT,
    impression_count INTEGER,
    first_seen DATETIME,
    last_seen DATETIME,
    UNIQUE(name, section)
)

-- Search query frequency
search_queries (
    query TEXT PRIMARY KEY,
    search_count INTEGER,
    first_searched DATETIME,
    last_searched DATETIME
)

-- Page view counts
page_views (
    path TEXT PRIMARY KEY,
    view_count INTEGER,
    unique_sessions INTEGER,
    last_viewed DATETIME
)

-- Geographic distribution
country_stats (
    country TEXT PRIMARY KEY,
    session_count INTEGER,
    last_seen DATETIME
)

-- Cache and rate limits
cache_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    expires_at INTEGER
)
```

### 3.2 Indexes

```sql
idx_events_type              -- Fast type filtering
idx_events_timestamp         -- Time range queries
idx_events_path              -- Page-specific queries
idx_events_session           -- Session reconstruction
idx_events_type_timestamp    -- Combined queries
idx_clicks_section           -- Section filtering
idx_clicks_count             -- Leaderboard sorting
idx_impressions_section      -- Section filtering
idx_impressions_count        -- Leaderboard sorting
idx_hourly_bucket            -- Time series
```

---

## 4. API Reference

### Base URL
```
https://tech-econ-analytics.rawat-pranjal010.workers.dev
```

### 4.1 POST /events

Receive tracking events from the browser.

**Request:**
```bash
curl -X POST /events \
  -H "Content-Type: application/json" \
  -H "Origin: https://tech-econ.com" \
  -d '{"v": 1, "events": [...]}'
```

**Response:**
```json
{"ok": true, "received": 5}
```

**Errors:**
- `403 Forbidden` - Origin not allowed
- `413 Payload Too Large` - Over 50KB
- `429 Too Many Requests` - Rate limited
- `400 Bad Request` - Invalid payload

### 4.2 GET /stats

Dashboard summary with 1-hour cache.

**Response:**
```json
{
  "updated": 1735600000000,
  "summary": {
    "pageviews": 1234,
    "sessions": 456,
    "clicks": 89,
    "searches": 23,
    "avgTimeOnPage": 45
  },
  "dailyPageviews": {
    "2025-12-25": 150,
    "2025-12-26": 180
  },
  "topPages": [
    {"name": "/packages", "count": 500},
    {"name": "/datasets", "count": 300}
  ],
  "topClicks": {
    "packages": [{"name": "pandas", "count": 50}],
    "datasets": [...],
    "learning": [...],
    "other": [...]
  },
  "topSearches": [
    {"name": "causal inference", "count": 15}
  ],
  "countries": [
    {"name": "US", "count": 200},
    {"name": "IN", "count": 150}
  ],
  "hourlyActivity": {
    "0": 10, "1": 5, ..., "23": 25
  },
  "_source": "d1",
  "_cached": true
}
```

### 4.3 GET /timeseries

Time-series data for charts.

**Parameters:**
- `days` (default: 7, max: 90)
- `granularity` (daily | hourly)

**Example:**
```bash
curl "/timeseries?days=30&granularity=daily"
```

**Response:**
```json
{
  "granularity": "daily",
  "days": 30,
  "data": [
    {"date": "2025-12-01", "pageviews": 100, "sessions": 50, "clicks": 20},
    {"date": "2025-12-02", "pageviews": 120, "sessions": 60, "clicks": 25}
  ]
}
```

### 4.4 GET /clicks

Content click leaderboard.

**Parameters:**
- `limit` (default: 50, max: 200)
- `section` (optional: packages | datasets | learning | other)

**Example:**
```bash
curl "/clicks?limit=20&section=packages"
```

**Response:**
```json
{
  "total": 20,
  "data": [
    {
      "name": "pandas",
      "section": "packages",
      "category": "Python",
      "count": 50,
      "last_clicked": "2025-12-31 15:30:00"
    }
  ]
}
```

### 4.5 GET /searches

Top search queries.

**Parameters:**
- `limit` (default: 50, max: 200)

**Response:**
```json
{
  "total": 15,
  "data": [
    {"query": "causal inference", "count": 25, "last_searched": "2025-12-31 14:00:00"},
    {"query": "a/b testing", "count": 18, "last_searched": "2025-12-31 13:45:00"}
  ]
}
```

### 4.6 GET /export

Export data as CSV or JSON.

**Parameters:**
- `type` (events | clicks | searches | daily)
- `format` (csv | json, default: csv)
- `days` (for events/daily, default: 30, max: 90)

**Examples:**
```bash
# Download clicks as CSV
curl -o clicks.csv "/export?type=clicks&format=csv"

# Get daily stats as JSON
curl "/export?type=daily&format=json&days=7"
```

### 4.7 GET /health

Health check for monitoring.

**Response:**
```json
{
  "status": "ok",
  "d1": true,
  "kv": true,
  "timestamp": 1735600000000
}
```

### 4.8 GET /migrate

One-time KV to D1 migration (protected).

**Parameters:**
- `key` (required: ADMIN_KEY secret)
- `limit` (batch size, default: 50)
- `cursor` (pagination cursor)

**Example:**
```bash
curl "/migrate?key=YOUR_ADMIN_KEY&limit=100"
```

---

## 5. Safety & Security

### 5.1 Rate Limiting

| Limit | Value | Purpose |
|-------|-------|---------|
| Requests per minute | 60 per IP | Prevent spam |
| Events per request | 50 | Limit batch size |
| Payload size | 50 KB | Prevent memory abuse |

Rate limits use hashed IPs stored temporarily in D1 cache_meta table with 1-minute expiry.

### 5.2 CORS Policy

Only these origins can send events:
```javascript
const ALLOWED_ORIGINS = [
  'https://tech-econ.com',
  'https://www.tech-econ.com',
  'https://rawatpranjal.github.io',
  'http://localhost:1313'  // Development
];
```

### 5.3 Protected Endpoints

| Endpoint | Protection |
|----------|------------|
| `/migrate` | Requires `ADMIN_KEY` secret |
| All POST | CORS origin validation |
| All GET | Public read (cached) |

### 5.4 Secrets Management

Stored in Cloudflare Workers secrets (not in code):

| Secret | Purpose | How to Set |
|--------|---------|------------|
| `ADMIN_KEY` | Protect migrate endpoint | `wrangler secret put ADMIN_KEY` |
| `CF_API_TOKEN` | Cloudflare Analytics API | `wrangler secret put CF_API_TOKEN` |

Current ADMIN_KEY: `5bc29b30bc2e24c44afbeea56b1790811d4606528b61cc48fe8af50ff2f8d0b2`

---

## 6. Deployment

### 6.1 Automatic Deployment

**Site (GitHub Pages):**
- Trigger: Push to `main` branch
- Workflow: `.github/workflows/deploy.yml`
- Includes: tracker.js updates

**Worker (Cloudflare):**
- Trigger: Push to `main` with changes in `analytics-worker/**`
- Workflow: `.github/workflows/deploy-worker.yml`
- Requires: `CLOUDFLARE_API_TOKEN` GitHub secret

### 6.2 Manual Deployment

```bash
cd analytics-worker

# Deploy worker
wrangler deploy

# Verify
curl https://tech-econ-analytics.rawat-pranjal010.workers.dev/health
```

### 6.3 Database Operations

```bash
# Run schema updates
wrangler d1 execute tech-econ-analytics-db --remote --file=./schema.sql

# Query data
wrangler d1 execute tech-econ-analytics-db --remote \
  --command "SELECT COUNT(*) FROM events"

# Backup (export)
wrangler d1 export tech-econ-analytics-db --remote --output=backup.sql
```

---

## 7. Monitoring & Debugging

### 7.1 Health Checks

```bash
# Basic health
curl https://tech-econ-analytics.rawat-pranjal010.workers.dev/health

# Expected response
{"status":"ok","d1":true,"kv":true,"timestamp":1735600000000}
```

### 7.2 Common Queries

```sql
-- Event count by type (last 7 days)
SELECT type, COUNT(*) as count
FROM events
WHERE timestamp > (strftime('%s', 'now') - 7*24*60*60) * 1000
GROUP BY type
ORDER BY count DESC;

-- Top clicked items
SELECT name, section, click_count
FROM content_clicks
ORDER BY click_count DESC
LIMIT 20;

-- Most searched queries
SELECT query, search_count
FROM search_queries
ORDER BY search_count DESC
LIMIT 20;

-- Daily traffic trend
SELECT date, pageviews, unique_sessions
FROM daily_stats
ORDER BY date DESC
LIMIT 30;

-- Countries by session count
SELECT country, session_count
FROM country_stats
ORDER BY session_count DESC;

-- Database size
SELECT page_count * page_size / 1024.0 / 1024.0 as size_mb
FROM pragma_page_count(), pragma_page_size();
```

### 7.3 Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| No events arriving | `/health` endpoint | Verify worker deployed |
| CORS errors | Browser console | Add origin to ALLOWED_ORIGINS |
| Rate limited | IP hitting limit | Wait 1 minute or check abuse |
| Stale stats | Cache TTL | Wait 1 hour or clear cache |
| Worker errors | Cloudflare dashboard logs | Check worker logs |

### 7.4 Cloudflare Dashboard Links

- **Workers**: https://dash.cloudflare.com → Workers & Pages → tech-econ-analytics
- **D1**: https://dash.cloudflare.com → Workers & Pages → D1 → tech-econ-analytics-db
- **Logs**: Workers dashboard → Logs tab

---

## 8. Content Attribution

For analytics to track a content item, add `data-name` attribute:

```html
<div class="card"
     data-name="pandas"
     data-section="packages"
     data-category="Python">
  <h3>pandas</h3>
  <p>Data manipulation library</p>
</div>
```

### Attributes

| Attribute | Required | Purpose |
|-----------|----------|---------|
| `data-name` | Yes | Unique item identifier |
| `data-section` | No | Section (packages/datasets/learning) |
| `data-category` | No | Subcategory for grouping |

### Auto-Detection

If `data-section` is not provided, it's inferred from URL:
- `/packages/*` → `packages`
- `/datasets/*` → `datasets`
- `/learning/*` → `learning`
- Other → `other`

---

## 9. Data Retention

| Data Type | Retention | Location |
|-----------|-----------|----------|
| Raw events | Forever | D1 `events` table |
| Daily aggregates | Forever | D1 `daily_stats` table |
| Hourly aggregates | Forever | D1 `hourly_stats` table |
| Click counts | Forever | D1 `content_clicks` table |
| Impression counts | Forever | D1 `content_impressions` table |
| Search queries | Forever | D1 `search_queries` table |
| Rate limit cache | 1 minute | D1 `cache_meta` table |
| Stats cache | 1 hour | D1 `cache_meta` table |
| KV backup | 30 days | Cloudflare KV (legacy) |

### Storage Projections

| Timeframe | Estimated Size | % of Free Tier |
|-----------|----------------|----------------|
| 1 year | ~55 MB | 1.1% |
| 5 years | ~275 MB | 5.5% |
| 10 years | ~550 MB | 11% |
| 90 years | ~5 GB | 100% |

---

## 10. Future Improvements

### Potential Enhancements

| Feature | Complexity | Value |
|---------|------------|-------|
| Real-time dashboard | Medium | Live visitor count |
| Funnel analysis | Medium | Conversion tracking |
| A/B test tracking | Low | Variant attribution |
| Error alerting | Low | Slack/email on errors |
| Geographic heatmap | Low | Visual country data |
| Session replay | High | Debug user journeys |
| Custom events API | Low | Track arbitrary events |

### Not Planned

| Feature | Reason |
|---------|--------|
| User identification | Privacy commitment |
| Cross-device tracking | Privacy commitment |
| Third-party integrations | Keep it simple |
| Paid analytics tools | Cost |

---

## Appendix A: Configuration Files

### wrangler.toml
```toml
name = "tech-econ-analytics"
main = "index.js"
compatibility_date = "2024-01-01"
workers_dev = true

[vars]
CF_ZONE_ID = "YOUR_ZONE_ID_HERE"

[[kv_namespaces]]
binding = "ANALYTICS_EVENTS"
id = "55666fb0baa64b12a16c9bc307483781"

[[d1_databases]]
binding = "DB"
database_name = "tech-econ-analytics-db"
database_id = "7c92226a-53ba-4d34-97ba-09bb985321a3"
```

### Hugo Config (hugo.toml)
```toml
[params]
trackerEndpoint = "https://tech-econ-analytics.rawat-pranjal010.workers.dev/events"
trackerEnabled = true
trackerDebug = false
```

---

## Appendix B: Quick Reference

### URLs

| Resource | URL |
|----------|-----|
| Worker | https://tech-econ-analytics.rawat-pranjal010.workers.dev |
| Site | https://tech-econ.com |
| GitHub | https://github.com/rawatpranjal/tech-econ |
| D1 Console | Cloudflare Dashboard → D1 |

### Commands

```bash
# Deploy worker
cd analytics-worker && wrangler deploy

# Query database
wrangler d1 execute tech-econ-analytics-db --remote --command "..."

# Set secret
wrangler secret put ADMIN_KEY

# View logs
wrangler tail tech-econ-analytics

# Export data
curl -o export.csv "https://tech-econ-analytics.rawat-pranjal010.workers.dev/export?type=clicks"
```

---

*Report generated by Claude Code on December 31, 2025*
