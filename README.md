# Leapify: Fullstack npm Module

A fullstack npm module — install it on your frontend project and it covers both sides of the stack: a browser-safe typed API client (`leapify/client`) and a server-side event management handler (`createLeapify`).

## Overview

Leapify is a fullstack npm module for DLSU CSO LEAP event websites. It integrates external services (Firebase Auth, Cloudflare D1, Google Forms, Contentful, Resend) into a cohesive API interface, enabling consistent event management operations across various LEAP websites.

Because it is built on [**Hono**](https://hono.dev/), a fast and lightweight edge framework, the server handler can be seamlessly mounted into any server layer — Next.js API routes, SvelteKit endpoints, Cloudflare Pages Functions, or a standalone Cloudflare Worker.

## ⚡ Quick Start

### 1. Install on your frontend project

```sh
npm install leapify
```

### 2. Browser / client components — `leapify/client`

```ts
import { createLeapifyClient, getLeapifyToken } from 'leapify/client'
import type { LeapEvent, SiteConfig } from 'leapify/types'
import { auth } from '@/lib/firebase' // your Firebase auth instance

const api = createLeapifyClient(
  process.env.NEXT_PUBLIC_API_URL!,
  () => getLeapifyToken(auth.currentUser),
)

const events = await api.getEvents()  // → LeapEvent[]
const config = await api.getConfig()  // → SiteConfig (maintenanceMode, registrationGloballyOpen, …)
const me     = await api.getMe()      // → UserProfile | null
```

### 3. Server layer — Next.js route / SvelteKit endpoint / Pages Function

```ts
import { createLeapify } from 'leapify'

export default createLeapify({
  allowedOrigins: ['https://yourdomain.com'],
})
```

### 4. Cloudflare bindings

Set up D1, KV, Queues, and secrets in `wrangler.toml` — see [☁️ Deployment](#️-deployment) below.

> Full setup, Firebase auth wiring, per-endpoint examples, and error handling →
> **[Frontend Integration Guide](./docs/frontend-integration-guide.md)**

---

## ☁️ Deployment

Leapify targets **Cloudflare Workers** (standalone backend) or **Cloudflare Pages Functions** (colocated with your frontend). Configure `wrangler.toml` with the required bindings — see [wrangler.toml.example](./wrangler.toml.example) for the full shape and [`.dev.vars.example`](./.dev.vars.example) for the secrets list.

| Platform | Method |
| :--- | :--- |
| **Cloudflare Workers** | `wrangler deploy` — standalone backend worker |
| **Cloudflare Pages** | Pages Function colocated with your frontend project |
| **Vercel** | Edge Functions / Serverless Functions |
| **Node.js / Bun / Deno** | Any server runtime (adapt bindings as needed) |

---

## 🏗️ Architecture Overview

### 1. Core Module Framework

| Component | Technology | Purpose | Link |
| :--- | :--- | :--- | :--- |
| **Framework** | Hono | Foundational web framework. | [hono.dev](https://hono.dev/) |
| **Language** | TypeScript | Strict typing for excellent DX. | [typescriptlang.org](https://www.typescriptlang.org/) |
| **ORM** | Drizzle ORM | Edge-compatible, type-safe SQL ORM. | [orm.drizzle.team](https://orm.drizzle.team/) |
| **Validation** | Zod | Runtime schema validation. | [zod.dev](https://zod.dev/) |
| **Testing** | Vitest | Fast unit and integration testing. | [vitest.dev](https://vitest.dev/) |

### 2. Integrations & Infrastructure

| Category | Service | Details | Quota | Link |
| :--- | :--- | :--- | :--- | :--- |
| **Relational DB** | Cloudflare D1 | Serverless SQLite (Native Edge/Drizzle) | 5M reads/day, 100k writes/day, 25GB (Workers Pro) | [Cloudflare D1](https://developers.cloudflare.com/d1/) |
| **Object Storage** | Cloudflare R2 | Edge Object Storage (S3-compatible) | 10 GB Storage, 1M reads/mo | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| **Authentication** | Firebase Auth | Google Focused / REST Identity Toolkit | (Usage-based free tier) | [Firebase Auth](https://firebase.google.com/docs/auth) |
| **Headless CMS** | Contentful | Structured Content (GraphQL / REST) | 100K API calls/mo, 50 GB CDN bandwidth/mo (Free) | [contentful.com](https://www.contentful.com/) |
| **Email Service** | Resend | Transactional Email (fetch/REST native) | 50,000 emails/mo (Pro) | [resend.com](https://resend.com) |
| **Cache & KV** | Cloudflare KV | Global Edge Key-Value Store | 10M reads/day (Workers Pro) | [Cloudflare KV](https://developers.cloudflare.com/kv/) |

### 3. API & Service Compatibility

While Cloudflare is the default infrastructure choice, Leapify is architected using **standard web APIs** and **adapter-friendly logic**. It remains functionally compatible with other enterprise and edge-ready service providers, including:

* **Databases:** Any Postgres or SQLite provider supported by Drizzle (e.g., Neon, Turso, Supabase, PlanetScale).
* **Storage:** Any **S3-compatible** storage (e.g., AWS S3, Backblaze B2, Supabase Storage).
* **CMS:** Other headless providers with GraphQL or REST APIs (e.g., Sanity, Hygraph).
* **Cache:** Alternatives like **Upstash Redis** (via REST) for high-frequency state management.

### 4. Resilience & Scale Mitigations

Designed with a peak load of **~30,000 concurrent students** in mind. The following patterns are implemented or recommended within the module.

#### Authentication Resilience (Firebase Auth)

Firebase Identity Toolkit has implicit rate limits that can surface as `429` errors under simultaneous auth bursts at event open.

| Strategy | Description |
| :--- | :--- |
| **KV Token Caching** | After first successful ID token verification, cache the decoded user payload in Cloudflare KV (`auth:token:<uid>`) with a TTL matching token expiry (3,600s). Subsequent requests skip Firebase entirely. |
| **Exponential Backoff** | Auth middleware retries on `429` responses using `100ms → 200ms → 400ms` backoff before surfacing an error to the client. |
| **Staggered Sign-in** | Coordinate with frontend consumers to open sign-in 15 minutes before event content go-live to naturally distribute auth load over time. |
| **GCP Quota Increase** | Submit a Firebase Auth quota increase request in GCP Console at least 72 hours before major events. |

#### Async Job Handling

Synchronous side effects (email dispatch, audit logging) block HTTP response times under load. All non-critical side effects are handled asynchronously.

| Strategy | Use Case | Implementation |
| :--- | :--- | :--- |
| **`ctx.waitUntil()`** | Fire-and-forget tasks (audit logs, analytics) | Runs after response is sent without blocking it. Zero latency impact on the client. |
| **Cloudflare Queues** | Email dispatch, webhook triggers | Worker pushes to a CF Queue → Consumer Worker processes and calls Resend. Client gets an instant `202 Accepted`. |
| **Dead Letter Queue (DLQ)** | Failed email jobs | CF Queue retries automatically up to the retry limit, then parks in DLQ for inspection. No silent failures. |

