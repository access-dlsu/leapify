# Leapify

The backend for DLSU CSO LEAP event websites. Leapify ships as:

| Mode                  | When to use                                                                            |
| :-------------------- | :------------------------------------------------------------------------------------- |
| **Standalone Worker** | You want a zero-code deploy — just configure secrets and run `wrangler deploy`         |
| **npm module**        | You have your own Worker / Next.js / SvelteKit app and want to mount Leapify inside it |

Both modes share exactly the same routes, auth, caching, and email logic.

---

## Mode 1 — Standalone Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/access-dlsu/leapify)

No code required. Clone, configure, deploy.

```sh
git clone https://github.com/access-dlsu/leapify
cd leapify
npm install
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` with your D1 database ID and KV namespace ID, then set your secrets:

```sh
# CORS — comma-separated allowed origins
wrangler secret put ALLOWED_ORIGINS
# → "https://yoursite.com,https://www.yoursite.com"

# Google OAuth (GIS)
wrangler secret put GOOGLE_CLIENT_ID
# → "your-client-id.apps.googleusercontent.com"

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

# Resend (optional email fallback — omit to disable)
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_ADDRESS

# Internal route security
wrangler secret put INTERNAL_API_SECRET
```

Build and deploy:

```sh
npm run build
wrangler deploy
```

Verify:

```sh
curl https://your-worker.your-subdomain.workers.dev/health
# → { "status": "ok", "providers": { "ses": true, "resend": false } }
```

> `wrangler.toml.example` has full comments for every binding. See [.dev.vars.example](./.dev.vars.example) for local dev.

---

## Mode 2 — npm module

Install into your own project and mount the handler:

```sh
npm install leapify
```

**Server layer** (Cloudflare Worker / Pages Function):

```ts
import { createLeapify } from 'leapify'

export default createLeapify({
  allowedOrigins: ['https://yourdomain.com'],
})
```

**Browser / client components** (using GIS):

```ts
import { createLeapifyClient, initGoogleSignIn } from 'leapify/client'

let currentJwt: string | null = null

await initGoogleSignIn({
  clientId: 'your-client-id.apps.googleusercontent.com',
  hostedDomain: 'dlsu.edu.ph',
  callback: (jwt) => {
    currentJwt = jwt
  },
})

const api = createLeapifyClient(
  process.env.NEXT_PUBLIC_API_URL!,
  () => currentJwt,
)

const events = await api.getEvents() // → LeapEvent[]
const config = await api.getConfig() // → SiteConfig
const me = await api.getMe() // → UserProfile | null
```

> Full setup and per-endpoint examples → **[Integration Guide](./docs/GUIDE.md)**

---

## How It Works

Leapify exposes `/api/` endpoints that your frontend consumes. The backend handles Google OAuth, Cloudflare D1 (database), Contentful (CMS), and transactional email (Amazon SES primary / Resend fallback) — all credentials live in `.env` / `wrangler.toml`, never in browser code.

- `/api/*` — restricted to your site's origin (`allowedOrigins` CORS gate)
- `/health` — publicly accessible for uptime monitoring; reports which email providers are configured

---

## Tech Stack

| Layer          | Technology               | Purpose                                                  |
| :------------- | :----------------------- | :------------------------------------------------------- |
| **Framework**  | Hono                     | Edge-optimized, <1ms cold start                          |
| **ORM**        | Drizzle + D1             | Type-safe SQL on Cloudflare's serverless SQLite          |
| **Validation** | Zod                      | Runtime schema validation                                |
| **Cache**      | Cloudflare KV + CDN      | JWT caching, slot availability, edge response cache      |
| **CMS**        | Contentful               | Headless CMS for all event/FAQ/site content              |
| **Email**      | Amazon SES + CF Queues   | Async transactional email — SES primary, Resend fallback |
| **Auth**       | Google Identity Services | Google Sign-In, restricted to `@dlsu.edu.ph`             |
| **Testing**    | Vitest + CF pool         | Unit + integration tests on real CF runtime              |

---

## Infrastructure

| Service           | Quota                                    | Role                          |
| :---------------- | :--------------------------------------- | :---------------------------- |
| Cloudflare D1     | 5M reads/day, 100k writes/day (Pro)      | Primary relational database   |
| Cloudflare KV     | 10M reads/day (Pro)                      | JWT cache + slot availability |
| Cloudflare Queues | —                                        | Async job dispatch            |
| Contentful        | 100k API calls/mo, 50GB CDN (Free)       | All CMS content               |
| Google OAuth      | Free (unlimited)                         | Identity + JWT issuance       |
| Amazon SES        | ~62k emails/mo free tier; $0.10/1k after | Primary transactional email   |
| Resend            | 50k emails/mo (Pro)                      | Fallback transactional email  |

---

## Caching Strategy

Three Cloudflare cache tiers keep D1 within quota at 30k concurrent users:

| Tier        | TTL    | What it caches                  |
| :---------- | :----- | :------------------------------ |
| CF CDN Edge | 7 days | `GET /events` list (ETag-gated) |
| CF KV       | 3,600s | JWT tokens                      |
| CF KV       | 5s     | Slot availability per event     |

---

## Auth

All users must sign in with `@dlsu.edu.ph` Google accounts. The backend rejects any other domain with `403 DOMAIN_RESTRICTED`.

| Role    | Token                       | Access                   |
| :------ | :-------------------------- | :----------------------- |
| `guest` | None                        | Public endpoints only    |
| `user`  | Google JWT (`@dlsu.edu.ph`) | Protected user endpoints |
| `admin` | JWT + admin role in D1      | Admin mutation endpoints |

---

## Resilience at Scale

**Google OAuth (free, no rate limits):** JWTs are cached in Cloudflare KV with a 3,600s TTL — requests skip verification on cache hit.

**Email (200–500ms send latency):** All email jobs are pushed to a Cloudflare Queue. The HTTP response returns immediately (`202 Accepted`); the consumer worker sends via **Amazon SES** (primary). If SES returns a non-retryable error **and** `RESEND_API_KEY` is set, the job is retried via **Resend** before landing in the DLQ. If `RESEND_API_KEY` is not set, fallback is skipped and the job goes straight to the DLQ after SES exhausts its retries.

> **Why SES?** SES supports 14 emails/second by default (vs. Resend's 10/s), has a native suppression list, and is significantly cheaper at high volumes ($0.10 per 1k). Resend is an **optional** fallback — configure it for a deliverability dashboard and better incident visibility, or omit `RESEND_API_KEY` to run SES-only.

---

## Deployment

Leapify targets **Cloudflare Workers** (standalone) or **Cloudflare Pages Functions** (colocated). Configure `wrangler.toml` with D1, KV, Queue bindings and Worker secrets.

**Standalone:**

```sh
npm run build && wrangler deploy
```

**npm module (inside your own repo):**

```sh
wrangler deploy   # your consumer worker that imports leapify
```

See [wrangler.toml.example](./wrangler.toml.example) and [.dev.vars.example](./.dev.vars.example) for the full config shape.
