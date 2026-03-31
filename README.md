# Leapify: Backend Core Module

An npm module serving as the universal backend logic layer for DLSU CSO LEAP event frontend websites.

## Overview

Leapify acts as a server-only backend dependency designed to integrate external services (CMS, Database, Emails, etc.) into a cohesive API interface. It handles data fetching, business logic, and third-party service integration, enabling consistent backend operations across various LEAP websites.

Because it is built on [**Hono**](https://hono.dev/), a fast and lightweight edge framework, the module operates as an independent backend app that can be seamlessly mounted into any consumer repository. This guarantees complete compatibility with edge and serverless environments.

## 📦 Quick Start (Zero-Config Consumer Setup)

Leapify is designed to be installed as an npm package and dropped into a Cloudflare Worker repository. No source code forks required.

### 1. Install
```sh
npm install leapify
```

### 2. Export in `src/worker.ts`
```ts
import { createLeapify } from 'leapify'

// Passes through the fetch, scheduled, and queue handlers to Cloudflare
export default createLeapify({
  allowedOrigins: ['https://your-frontend-domain.com'],
})
```

### 3. Configure `wrangler.toml`
Set up the bindings required by Leapify (D1, KV, Queues, Crons). See the [Environment Variables & Config](#environment-variables--config) section below for the required shape.

---

## 🌐 Frontend Integration

Leapify is also installable on the frontend project. A single `npm install leapify` covers both sides of the stack:

- **Server side** — your framework's server runtime (Next.js API routes, SvelteKit endpoints, Cloudflare Pages Functions) mounts `createLeapify` as the backend handler.
- **Client side** — browser components import from `leapify/client` for a typed fetch API with zero Cloudflare/server dependencies.

```ts
// Browser / client components
import { createLeapifyClient, getLeapifyToken } from 'leapify/client'
import type { LeapEvent, SiteConfig } from 'leapify/types'
```

See the **[Frontend Integration Guide](./docs/frontend-integration-guide.md)** for step-by-step setup, Firebase auth wiring, per-endpoint examples, error handling, and the admin gate pattern.

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

---

## Supported Runtimes & Deployment

| Platform | Deployment Method |
| :--- | :--- |
| **Cloudflare** | Workers & Pages |
| **Vercel** | Edge Functions / Serverless Functions |
| **Node.js** | Compatible with any Node.js environment (Docker, bare metal, etc.) |
| **Bun** | Native `bun run` |
| **Deno** | Native `Deno.serve` |
