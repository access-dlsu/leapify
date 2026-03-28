# Leapify: Backend Core Module

An npm module serving as the universal backend logic layer for DLSU CSO LEAP event frontend websites.

## 🚀 Overview

Leapify acts as a server-only backend dependency designed to integrate external services (Contentful, Firebase, etc.) into a cohesive API interface. It handles data fetching, business logic, and third-party service integration, enabling consistent backend operations across various LEAP websites. 

Because it is built on [**Hono**](https://hono.dev/), a fast and lightweight edge framework, the module operates as an independent backend app that can be seamlessly mounted into any consumer repository. This guarantees complete compatibility with edge and serverless environments, such as **Cloudflare Workers**, **Vercel Edge/Serverless Functions**, **Dockerized Node.js containers**, and **Bun/Deno**.

## 🛠️ Tech Stack & Architecture

### 1. Core Module Framework
* **Hono:** The foundational web framework. It abstracts away the runtime differences, allowing you to write clean routing and middleware logic that handles `Context` effortlessly while compiling perfectly to all major edge/node runtimes.
* **TypeScript:** For strict typing, ensuring robustness and excellent developer experience (DX) when consumed by external repos.
* **Zod / `@hono/zod-validator`:** For native runtime schema validation of inbound data and standardizing third-party API payloads.

### 2. Primary Integrations

#### Contentful (Headless CMS)
* **Purpose:** Manages LEAP event details, schedules, speaker information, and dynamic frontend page content.
* **Implementation:** Instead of bulky server-only SDKs, use the Contentful GraphQL API or REST API directly via the native `fetch` interface, keeping the Hono module lightweight and edge-ready.

#### Firebase (Authentication & Realtime/Document Database)
* **Purpose:** Handles user sign-ins, session management, and stores dynamic/user-generated data (e.g., event registrations, feedback, live Q&A).
* **Implementation:** For Edge support, use the REST APIs for database operations and Firebase Auth's ID token verification, or edge-compatible specific SDK modules, deliberately avoiding the heavyweight Node-only `firebase-admin` module.

### 3. Recommended Additional Integrations

#### Email Services (Resend / SendGrid)
* **Purpose:** Sending ticket confirmations, event reminders, and announcements to attendees.
* **Implementation:** Simple REST API integrations using `fetch`. Resend is highly recommended as it relies purely on Edge-compatible web standards.

#### Storage / Cache (Upstash Redis)
* **Purpose:** Rate limiting, session caching, and reducing Contentful/Firebase read operations during high traffic spikes.
* **Implementation:** Upstash provides a REST-based Redis approach standardizing the connection and making it perfect for serverless endpoints without TCP dependencies.

#### Database Alternative (Supabase / Postgres)
* **Purpose:** For highly structured relational data (e.g., rigid ticketing transactions, seating, accounting).
* **Implementation:** Utilizing `@supabase/supabase-js`, which relies on standard `fetch` and is fully compatible with Edge deployment environments.

## 🌐 Supported Runtimes & Deployment

Leapify encapsulates an entire API routing structure using Hono. Consumers of this module simply import the Leapify Hono router and mount or adapt it into their deployment strategy:

* **Vercel (Next.js App Router):** Serve the entire Leapify Hono app via a `route.ts` API handler using `handle(app)`.
* **Cloudflare Workers:** Export the `app.fetch` object directly at the root.
* **Docker / Traditional Node.js (Express):** Adapt the Hono app to an underlying Node HTTP server using `@hono/node-server`.
* **Bun / Deno:** Pass the Hono app natively into the standard web server startup commands.

## 📦 Usage Example (Conceptual)

```typescript
// leapify/index.ts (Inside the Npm Module)
import { Hono } from 'hono';

export const app = new Hono();

app.get('/events', async (c) => {
  // Logic communicating with Contentful/Firebase/Zod
  return c.json({ data: [{ name: "LEAP Event 1" }] });
});

export default app;
```

```typescript
// CONSUMER APP: Next.js App Router Setup (app/api/[[...route]]/route.ts)
import { handle } from 'hono/vercel';
import leapifyApp from 'leapify'; // The exported Hono router from the module

// Mount the Leapify module as a sub-router to automatically handle all /api endpoints
export const GET = handle(leapifyApp);
export const POST = handle(leapifyApp);
export const PUT = handle(leapifyApp);
export const DELETE = handle(leapifyApp);
```