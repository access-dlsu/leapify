# Leapify Integration Guide

Step-by-step guide for integrating the `leapify` npm module into your Cloudflare Worker or Pages Function.

---

## 1. Install

```bash
npm install leapify
```

Peer dependencies (install if not already present):

```bash
npm install hono drizzle-orm @cloudflare/workers-types
```

---

## 2. Server Setup

### 2.1 Mount the handler

Create a `worker.ts` (or `[[path]].ts` for Pages Functions):

```ts
// worker.ts
import { createLeapify } from 'leapify'

export default createLeapify({
  allowedOrigins: ['https://yourdomain.com', 'https://www.yourdomain.com'],
})
```

This returns `{ fetch, scheduled, queue }` — shaped for Cloudflare Workers.

### 2.2 Configure `wrangler.toml`

```toml
name = "leapify"
main = "worker.ts"
compatibility_date = "2026-04-02"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "leapify"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

# Optional — R2 for file storage
# [[r2_buckets]]
# binding = "FILES"
# bucket_name = "leapify-files"

# Optional — Queues for async email
# [queues.producers]
# binding = "EMAIL_QUEUE"
# queue_name = "leapify-email-queue"

# [queues.consumers]
# queue = "leapify-email-queue"
# max_batch_size = 10
# max_batch_timeout = 30
# max_retries = 3
# dead_letter_queue = "leapify-email-dlq"

# Cron triggers
[triggers]
crons = [
  "* * * * *",    # batch-release
  "*/5 * * * *",  # reconcile-slots
  "0 * * * *",    # reminder-emails + lifecycle-check
  "0 0 * * *"     # renew-watches
]
```

### 2.3 Set secrets

```bash
# Google OAuth (GIS)
wrangler secret put GOOGLE_CLIENT_ID

# Google Forms
wrangler secret put GFORMS_SERVICE_ACCOUNT_JSON
wrangler secret put GFORMS_WEBHOOK_SECRET

# Contentful
wrangler secret put CONTENTFUL_SPACE_ID
wrangler secret put CONTENTFUL_ACCESS_TOKEN
wrangler secret put CONTENTFUL_ENVIRONMENT

# Amazon SES (primary email)
wrangler secret put SES_REGION
wrangler secret put SES_ACCESS_KEY_ID
wrangler secret put SES_SECRET_ACCESS_KEY
wrangler secret put SES_FROM_ADDRESS

# Resend (optional fallback email)
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_ADDRESS

# Internal security
wrangler secret put INTERNAL_API_SECRET
```

### 2.4 Deploy

```bash
wrangler deploy
```

Verify:

```bash
curl https://your-worker.workers.dev/health
# → { "status": "ok", "providers": { "ses": true, "resend": false } }
```

---

## 3. Database Migration

Run migrations against your D1 database:

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply to D1 (local)
wrangler d1 migrations apply leapify --local

# Apply to D1 (production)
wrangler d1 migrations apply leapify --remote
```

---

## 4. Client Setup (Browser)

Import the typed API client in your frontend:

```ts
import { createLeapifyClient, initGoogleSignIn } from 'leapify/client'

let currentJwt: string | null = null

const api = createLeapifyClient(
  'https://your-worker.workers.dev',
  () => currentJwt,
)
```

### Google Sign-In (GIS)

Leapify uses Google Identity Services (GIS) for authentication. GIS is free, has no rate limits, and works reliably on all browsers.

**Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (type: Web application)
3. Add your frontend domain to **Authorized JavaScript origins**
4. Copy the Client ID (looks like `xxx.apps.googleusercontent.com`)
5. Set `GOOGLE_CLIENT_ID` in Leapify Worker secrets

**Frontend:**

```ts
import {
  createLeapifyClient,
  initGoogleSignIn,
  signInWithGoogle,
  renderGoogleButton,
} from 'leapify/client'

// Initialize GIS once on app load
await initGoogleSignIn({
  clientId: 'your-client-id.apps.googleusercontent.com',
  hostedDomain: 'dlsu.edu.ph', // restrict to DLSU accounts
  callback: async (jwt) => {
    currentJwt = jwt
    // JWT can be used directly — Leapify backend accepts Google tokens
    const me = await api.getMe()
    console.log('Signed in:', me)
  },
})

// Option 1: Show One Tap prompt
signInWithGoogle()

// Option 2: Render official Google Sign-In button
renderGoogleButton(document.getElementById('google-btn')!, {
  theme: 'outline',
  size: 'large',
  text: 'signin_with',
})
```

**How it works:**

1. `initGoogleSignIn(config)` — Loads the GIS script and configures the client ID + callback.
2. `signInWithGoogle()` — Shows the Google One Tap prompt. Call from a user gesture.
3. `renderGoogleButton(container, options)` — Renders an official Google Sign-In button.
4. The callback receives a Google JWT that Leapify's backend accepts directly.

> **Note:** GIS uses duck-typed interfaces compatible with the Google SDK — no hard import from Google in the Leapify package.

### Available methods

```ts
// Events (public)
const events = await api.getEvents() // LeapEvent[]
const event = await api.getEvent('my-event') // LeapEvent
const slots = await api.getSlots('my-event') // SlotInfo

// User
const me = await api.getMe() // UserProfile | null
const bookmarks = await api.getBookmarks() // BookmarkEntry[]
await api.toggleBookmark('event-id') // { bookmarked: boolean }

// Site config (public)
const config = await api.getConfig() // SiteConfig

// FAQs (public)
const faqs = await api.getFaqs() // Faq[]

// ── Admin mutations (require admin JWT) ──────────────────────────

// Events
await api.createEvent({
  slug: 'new-event',
  title: 'New Event',
  categoryName: 'Workshop',
  categoryPath: '/workshops',
})
await api.updateEvent('new-event', { title: 'Updated Title', maxSlots: 100 })

// FAQs
await api.createFaq({ question: 'What is LEAP?', answer: 'A DLSU CSO event.' })
await api.updateFaq('faq-id', { answer: 'Updated answer.' })
await api.deleteFaq('faq-id') // soft delete (isActive: false)

// Site config (type-safe keys)
await api.setConfig('maintenance_mode', true)
await api.setConfig('site_name', 'LEAP 2026')
await api.setConfig('registration_globally_open', true)
```

### Type imports

```ts
import type {
  LeapEvent,
  UserProfile,
  SlotInfo,
  SiteConfig,
  Faq,
  CreateEventBody,
  UpdateEventBody,
  CreateFaqBody,
  UpdateFaqBody,
  SiteConfigKey,
  SiteConfigMap,
} from 'leapify/types'
```

---

## 5. API Endpoints

All endpoints are mounted at the root of your worker.

| Method      | Path                              | Auth     | Description                 |
| ----------- | --------------------------------- | -------- | --------------------------- |
| `GET`       | `/health`                         | None     | Health check (public)       |
| `GET`       | `/events`                         | None     | List published events       |
| `GET`       | `/events/:slug`                   | None     | Get event by slug           |
| `GET`       | `/events/:slug/slots`             | None     | Real-time slot availability |
| `POST`      | `/events`                         | Admin    | Create event                |
| `PATCH`     | `/events/:slug`                   | Admin    | Update event                |
| `GET`       | `/users/me`                       | User     | Current user profile        |
| `GET`       | `/users/me/bookmarks`             | Optional | User's bookmarks            |
| `POST`      | `/users/me/bookmarks/:eventId`    | User     | Toggle bookmark             |
| `GET`       | `/faqs`                           | None     | List active FAQs            |
| `POST`      | `/faqs`                           | Admin    | Create FAQ                  |
| `PATCH`     | `/faqs/:id`                       | Admin    | Update FAQ                  |
| `DELETE`    | `/faqs/:id`                       | Admin    | Soft-delete FAQ             |
| `GET/PATCH` | `/config`                         | Admin    | Site configuration          |
| `POST`      | `/.well-known/leapify/pow/verify` | None     | PoW challenge verification  |

### Response format

```jsonc
// Success
{ "data": <T> }

// Error
{ "error": { "code": "NOT_FOUND", "message": "Event not found" } }
```

---

## 6. Authentication

All users must sign in with `@dlsu.edu.ph` Google accounts. Other domains are rejected with `403 DOMAIN_RESTRICTED`.

| Role  | How to get             | Access                   |
| ----- | ---------------------- | ------------------------ |
| Guest | No token               | Public endpoints only    |
| User  | Google JWT             | Protected user endpoints |
| Admin | JWT + admin role in D1 | Admin mutation endpoints |

To set a user as admin, update their role in the D1 `users` table.

---

## 7. Anti-Scraping (PoW Challenge)

Leapify includes an optional proof-of-work challenge middleware that blocks automated scrapers.

### How it works

1. Client requests an endpoint without a valid `leapify-pow` cookie
2. Server serves an HTML challenge page (SHA-256 PoW)
3. Browser solves the challenge (~100-500ms) and posts the solution
4. Server sets a signed cookie (1h TTL) — subsequent requests pass through

### Configuration

| Env Var          | Default | Description                                       |
| ---------------- | ------- | ------------------------------------------------- |
| `POW_DIFFICULTY` | `4`     | Leading zero bits required (1-8). Higher = harder |

### Exempt paths

These paths skip PoW entirely:

- `/health` — uptime monitors
- `/internal/*` — webhooks
- Requests with `Authorization: Bearer` header — authenticated clients

### Standalone import

The PoW middleware is also available as a standalone import for non-Leapify Hono apps:

```ts
import {
  createPowChallengeMiddleware,
  handlePowVerify,
  POW_VERIFY_PATH,
} from 'leapify/middleware/pow-challenge'

const app = new Hono()

app.use('*', createPowChallengeMiddleware())
app.post(POW_VERIFY_PATH, handlePowVerify)
```

### Rate limiting

Built-in KV rate limiting is applied to key endpoints:

| Endpoint                  | Limit   | Window | Identifier |
| ------------------------- | ------- | ------ | ---------- |
| `GET /events`             | 60 req  | 60s    | IP         |
| `GET /events/:slug/slots` | 120 req | 60s    | IP         |
| `POST /bookmarks`         | 10 req  | 60s    | User ID    |
| `POST /events` (admin)    | 20 req  | 60s    | User ID    |

---

## 8. Environment Variables Reference

### Required

| Variable                      | Description                                |
| ----------------------------- | ------------------------------------------ |
| `GOOGLE_CLIENT_ID`            | Google OAuth 2.0 Client ID                 |
| `GFORMS_SERVICE_ACCOUNT_JSON` | Google Forms service account JSON          |
| `GFORMS_WEBHOOK_SECRET`       | Google Forms webhook signing secret        |
| `INTERNAL_API_SECRET`         | HMAC key for internal routes + PoW cookies |
| `CONTENTFUL_SPACE_ID`         | Contentful space ID                        |
| `CONTENTFUL_ACCESS_TOKEN`     | Contentful delivery API token              |
| `CONTENTFUL_ENVIRONMENT`      | Contentful environment (usually `master`)  |

### Email (at least one required)

| Variable                | Description                        |
| ----------------------- | ---------------------------------- |
| `SES_REGION`            | AWS region (e.g. `us-east-1`)      |
| `SES_ACCESS_KEY_ID`     | IAM access key                     |
| `SES_SECRET_ACCESS_KEY` | IAM secret key                     |
| `SES_FROM_ADDRESS`      | Verified SES sender address        |
| `RESEND_API_KEY`        | Resend API key (optional fallback) |
| `RESEND_FROM_ADDRESS`   | Resend sender address              |
| `EMAIL_FROM_NAME`       | Display name for emails            |

### Optional

| Variable              | Default          | Description                     |
| --------------------- | ---------------- | ------------------------------- |
| `ALLOWED_ORIGINS`     | `[]` (block all) | Comma-separated CORS origins    |
| `POW_DIFFICULTY`      | `4`              | PoW challenge difficulty (1-8)  |
| `CONTENTFUL_SPACE_ID` | —                | Contentful space (if using CMS) |

---

## 9. Caching

Three Cloudflare cache tiers:

| Tier     | TTL    | What                            |
| -------- | ------ | ------------------------------- |
| CDN Edge | 7 days | `GET /events` list (ETag-gated) |
| KV       | 3600s  | JWT tokens                      |
| KV       | 5s     | Slot availability per event     |

The `GET /events` endpoint returns `Cache-Control: public, max-age=604800` with ETag support. Browsers and CDNs will cache responses and revalidate with `If-None-Match`.

---

## 10. Troubleshooting

### `UNAUTHORIZED` on all requests

- Verify `GOOGLE_CLIENT_ID` is set correctly
- Check the client is sending `Authorization: Bearer <token>` header
- Token must be from a `@dlsu.edu.ph` Google account

### CORS errors in browser

- Verify `ALLOWED_ORIGINS` includes your frontend domain exactly (no trailing slash)
- Include both `https://yourdomain.com` and `https://www.yourdomain.com` if applicable
- Check the browser console for the exact `Origin` being sent

### Email not sending

- At least one of `SES_*` or `RESEND_API_KEY` must be fully configured
- Check `/health` endpoint — `providers` field shows which are active
- Failed emails land in the DLQ: `leapify-email-dlq`

### `VALIDATION_ERROR` on event creation

- `slug` is required (1-100 chars, alphanumeric + hyphens)
- `title` is required
- `maxSlots` must be a positive integer

### PoW challenge loops

- Verify `INTERNAL_API_SECRET` is set — it's used to sign the PoW cookie
- If cookies are being blocked, check `SameSite` / `Secure` flags in browser dev tools
- Increase `POW_DIFFICULTY` only if you're seeing automated bypasses (default 4 is sufficient)
