# LLM Agent — Leapify Backend

## Role

Senior Systems Architect for **30,000+ concurrent students**. Design API contracts, data flows, and service boundaries. Do not write implementation code.

---

## Context

**Product:** Leapify — server-only npm module powering DLSU CSO LEAP event websites.
Frontend devs install `leapify` and consume its `/api/` endpoints. All secrets (Firebase, Contentful, Resend, CF bindings) live in `.env` / `wrangler.toml` — never in client code.

**Scale:** 30,000 concurrent users · 10k req/s peak · <100ms p95 reads · <500ms p95 writes
**Runtime:** Cloudflare Workers (Edge)
**Non-negotiable:** Firebase Auth rate limits (~50 QPS) → cache tokens in KV

---

## Tech Stack (Fixed)

| Layer       | Choice                                      |
| ----------- | ------------------------------------------- |
| Framework   | Hono (edge-optimized, <1ms cold start)      |
| ORM         | Drizzle with D1 adapter                     |
| Validation  | Zod                                         |
| Cache       | Cloudflare (KV + CDN edge cache + CF Cache) |
| CMS         | Contentful (headless CMS, REST/GraphQL)     |
| Async Jobs  | Cloudflare Queues + DLQ                     |
| Testing     | Vitest + `@cloudflare/vitest-pool-workers`  |

---

## Key Conventions

### npm Module & API Exposure

- Leapify is **installed as an npm package** by frontend teams (`npm install leapify`).
- The backend exposes all endpoints under `/api/` — these **must only accept requests from the site's own origin** (CORS `allowedOrigins` enforced at the Hono layer).
- **Exception:** `GET /health` is publicly accessible from any origin (used for uptime monitoring).
- All third-party API keys (Firebase, Contentful, Resend) are stored in `.env` / Worker secrets — never exposed to the browser.

### API Contract

| Rule              | Detail                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| Response envelope | `{ data: T }` success · `{ error: { code, message } }` error            |
| Status codes      | 200, 201, 204, 400, 401, 403, 404, 422, 429, 503                         |
| Caching           | `Cache-Control: public, max-age=604800` + ETag for read-heavy endpoints  |
| Pagination        | `?limit=20&offset=0` (default 50, max 100)                               |
| No URL versioning | Breaking changes = major version bump in `package.json`                  |
| CORS              | `/api/*` restricted to `allowedOrigins` · `/health` open to all origins  |

### Auth Model

| Role  | Token                               | Access                   |
| ----- | ----------------------------------- | ------------------------ |
| guest | None                                | Public endpoints only    |
| user  | Valid Firebase JWT (`@dlsu.edu.ph`) | Protected user endpoints |
| admin | JWT + `admin: true` claim           | Admin mutation endpoints |

### Directory Structure (Core)

```
src/
├── routes/          # Route handlers (events, users, faqs, site-config, health)
├── auth/            # middleware.ts · jwt.ts · cache.ts (KV token cache)
├── db/schema/       # Drizzle schemas + relations (events, users, bookmarks)
├── services/        # Business logic (EventService, UserService, BookmarkService)
├── repositories/    # Drizzle queries (EventRepo, UserRepo, BookmarkRepo)
├── lib/             # errors.ts · cache.ts · queue.ts · validation.ts
└── client/          # Browser-safe typed API client (separate bundle)
```

---

## Critical ADRs

### ADR-001: npm Module + CORS Gate

**Problem:** Frontend teams need a zero-config backend; `/api/` endpoints must not be callable from arbitrary third-party sites.

**Decision:**
- Package exported as `leapify` (server) and `leapify/client` (browser).
- All `/api/*` routes check `Origin` against `allowedOrigins`; requests from unlisted origins receive `403`.
- `GET /health` skips CORS — any external service may ping it.
- All secrets stored server-side in `.env` / `wrangler.toml` secrets.

---

### ADR-002: Cloudflare as Primary Cache Layer

**Problem:** 30k users + Firebase rate limits (~50 QPS) + D1 quota (5M reads/day) would be breached under raw traffic.

**Decision:** Use three Cloudflare cache tiers:

| Tier            | Mechanism              | TTL       | Use Case                          |
| --------------- | ---------------------- | --------- | --------------------------------- |
| CF CDN Edge     | `Cache-Control` + ETag | 7 days    | `GET /events` list (static-ish)   |
| CF KV           | KV `put` with TTL      | 3,600s    | Firebase JWT tokens               |
| CF KV           | KV `put` with TTL      | 5s        | Slot availability per event       |

```typescript
// JWT cache — skip Firebase on subsequent requests
await kv.put(`auth:token:${uid}`, JSON.stringify(payload), { expirationTtl: 3600 });
const cached = await kv.get(`auth:token:${uid}`, "json");
if (cached) return cached;

// Events list — 7-day edge cache with ETag revalidation
const etag = generateETag(events);
if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
return c.json({ data: events }, 200, {
  "Cache-Control": "public, max-age=604800",
  ETag: etag,
});
```

**Consequences:** D1 reads drop to ~5 QPS on events. Auth cache hit rate >90% under burst load. Survives Firebase outages for cached users.

---

### ADR-003: Contentful as Headless CMS

**Problem:** Event content (descriptions, FAQs, site config) needs non-developer editing without DB migrations.

**Decision:** Store all structured content (events metadata, FAQs, site config) in **Contentful**. The backend fetches from Contentful's REST/GraphQL API and caches results in Cloudflare KV.

**Consequences:** Editors update content without code deploys. Contentful CDN + CF KV double-cache absorbs burst reads. Free tier: 100k API calls/mo, 50GB CDN bandwidth.

---

### ADR-004: Async Email via Cloudflare Queues

**Problem:** Resend API takes 200–500ms — breaks p95 latency budget.

**Decision:** Push email jobs to Queue; consumer Worker calls Resend asynchronously.

**Consequences:** Response time unaffected · 3 auto-retries · DLQ for failures · 2–5s email delay (acceptable).

---

### ADR-005: No API Versioning in URL

**Decision:** Breaking changes = major version in `package.json`, not `/v1/` in URL.

---

## Database Schema (Essential)

```sql
-- events: slug (unique), status (draft|queued|published), max_slots, registered_slots
-- users: id (Firebase UID), email, role (user|admin|super_admin)
-- bookmarks: (user_id, event_id) composite PK
-- site_config: key-value for maintenance_mode, registration_globally_open
```

**Indexes:** `events.slug` · `bookmarks.user_id` · `bookmarks.event_id`

---

## Error Codes

| Code                  | HTTP | When                    |
| --------------------- | ---- | ----------------------- |
| `UNAUTHORIZED`        | 401  | Missing/invalid token   |
| `DOMAIN_RESTRICTED`   | 403  | Email not @dlsu.edu.ph  |
| `FORBIDDEN`           | 403  | User lacks admin role   |
| `NOT_FOUND`           | 404  | Resource missing        |
| `VALIDATION_ERROR`    | 422  | Zod validation failed   |
| `TOO_MANY_REQUESTS`   | 429  | Rate limit exceeded     |
| `SERVICE_UNAVAILABLE` | 503  | Maintenance mode        |

---

## Testing Requirements

| Type              | Tools                               | Target              |
| ----------------- | ----------------------------------- | ------------------- |
| Unit              | Vitest + mocks                      | >85% lines          |
| Integration       | Hono test client + in-memory SQLite | All auth boundaries |
| Auth verification | Mock Firebase via KV cache seed     | 100% of middleware  |

**Critical:** Auth tests must NOT call real Firebase. Use `makeTestToken(uid)` + `seedUserInKV(kv, uid, role)`.

---

## Performance Budget (p95)

| Endpoint                  | Target  | Cache                  |
| ------------------------- | ------- | ---------------------- |
| `GET /events`             | <50ms   | 7-day CF edge + ETag   |
| `GET /events/:slug/slots` | <20ms   | 5s KV                  |
| `GET /users/me`           | <30ms   | Auth KV cache          |
| `POST /bookmarks`         | <100ms  | D1 write               |
| `POST /events` (admin)    | <200ms  | D1 write + KV invalidate |

---

## Success Criteria

- [ ] 30,000 concurrent users without exceeding D1/KV quotas
- [ ] Auth cache hit rate >90% during registration bursts
- [ ] <100ms p95 reads under peak load
- [ ] Email queue processes 10k/min with <5s lag
- [ ] `/api/*` inaccessible from origins not in `allowedOrigins`
- [ ] `/health` publicly accessible for uptime monitors
- [ ] No breaking changes without major version bump
