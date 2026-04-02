# Frontend Integration Guide

This guide walks through integrating `leapify` into a frontend project (Next.js, SvelteKit, Nuxt, etc.).

`leapify` is a **server-only npm module** — one install gives you a Cloudflare Worker backend that your frontend calls via `leapify/client`. All secrets (Firebase, Contentful, Amazon SES, CF bindings) live in `.env` / `wrangler.toml` and are never exposed to the browser. Transactional email uses **Amazon SES** as the primary provider; **Resend** is an optional fallback that activates only when `RESEND_API_KEY` is set.

> **API access:** All `/api/*` endpoints are CORS-restricted to `allowedOrigins` — only your own site's origin can call them. `GET /health` is the only endpoint open to external origins (uptime monitoring).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install the Package](#2-install-the-package)
3. [Environment Variables](#3-environment-variables)
4. [Firebase SDK Setup](#4-firebase-sdk-setup)
5. [Google Sign-In (DLSU Domain)](#5-google-sign-in-dlsu-domain)
6. [Set Up the API Client](#6-set-up-the-api-client)
7. [Per-Endpoint Usage](#7-per-endpoint-usage)
8. [TypeScript Types](#8-typescript-types)
9. [Error Handling](#9-error-handling)
10. [Admin Gate Pattern](#10-admin-gate-pattern)
11. [Registration Flow Checklist](#11-registration-flow-checklist)
12. [Mounting the Server Handler (Optional)](#12-mounting-the-server-handler-optional)

---

## 1. Prerequisites

- Firebase project configured (Google Sign-In enabled)
- Contentful space configured with the Leapify content model (events, FAQs, site config)
- Backend Worker deployed (e.g., `https://api.leap.yourdomain.com`)
- All users must sign in with `@dlsu.edu.ph` Google accounts — the backend enforces this and returns `403 DOMAIN_RESTRICTED` for any other email domain

---

## 2. Install the Package

```sh
npm install leapify
```

This gives you two import paths:

| Import path | Use in |
|---|---|
| `leapify` | **Server-only**: Worker handler, Drizzle schema, CF bindings |
| `leapify/client` | Browser + server: typed fetch client, shared types, Firebase helper |
| `leapify/types` | Type-only imports for components |

> Do **not** import from `leapify` (server) in browser/client components — it bundles server secrets and CF bindings.

---

## 3. Environment Variables

Frontend `.env.local` only needs public values — all secret keys (Firebase admin, Contentful, Amazon SES, CF bindings) live in the Worker's `.env` / `wrangler.toml` secrets:

```env
# Public — safe to expose to browser
NEXT_PUBLIC_API_BASE_URL=https://api.leap.yourdomain.com
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

> `FIREBASE_PROJECT_ID` must match the Worker secret of the same name — used to verify JWT issuer.

---

## 4. Firebase SDK Setup

Install the Firebase client SDK:

```sh
npm install firebase
```

Initialize a singleton (e.g., `lib/firebase.ts`):

```ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

---

## 5. Google Sign-In (DLSU Domain)

Use `hd: "dlsu.edu.ph"` as a hint to pre-select the DLSU account in the Google picker. Even if bypassed on the frontend, the backend rejects non-DLSU tokens.

```ts
// lib/auth.ts
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export async function signInWithGoogle() {
  googleProvider.setCustomParameters({ hd: "dlsu.edu.ph" });
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}
```

---

## 6. Set Up the API Client

Create a module-level client instance (`lib/api.ts`):

```ts
import { createLeapifyClient, getLeapifyToken } from "leapify/client";
import { auth } from "./firebase";

export const api = createLeapifyClient(
  process.env.NEXT_PUBLIC_API_BASE_URL!,
  () => getLeapifyToken(auth.currentUser),
);
```

`getLeapifyToken` calls `user.getIdToken()` for authenticated users and returns `null` for guests. The client attaches `Authorization: Bearer <token>` automatically on every request where a token is available.

> `getIdToken()` refreshes the token automatically when it expires — no manual refresh needed.

---

## 7. Per-Endpoint Usage

### Site Config — gate the whole app

Fetch this on app load. If `maintenanceMode` is `true` or `comingSoonUntil` is in the future, show the appropriate page instead of the main UI.

```ts
const config = await api.getConfig();

if (config.maintenanceMode) return <MaintenancePage />;
if (config.comingSoonUntil && config.now < config.comingSoonUntil) {
  return <CountdownPage until={config.comingSoonUntil} />;
}
```

> Use `config.now` (server unix epoch) for all timestamp comparisons to avoid client clock drift.

### Events List

```ts
const events = await api.getEvents();
// → LeapEvent[]
```

Event content (descriptions, images, metadata) is sourced from **Contentful** and cached at two layers: Cloudflare CDN edge (`Cache-Control: public, max-age=604800`) and Cloudflare KV. In Next.js, the response is automatically cached. To revalidate on demand, call `revalidateTag` or `revalidatePath` from a Server Action.

### Event Detail

```ts
const event = await api.getEvent("pirates-cove-2025");
// → LeapEvent
```

### Slot Availability — poll every 8 seconds

```ts
// Poll on event detail pages
const [slots, setSlots] = useState<SlotInfo | null>(null);

useEffect(() => {
  const refresh = () => api.getSlots(slug).then(setSlots);
  refresh();
  const id = setInterval(refresh, 8000);
  return () => clearInterval(id);
}, [slug]);
```

The CF edge caches this endpoint for 5 seconds per region — polling at 8-second intervals respects that window.

### Current User Profile

```ts
const me = await api.getMe();
// → UserProfile | null (null for unauthenticated guests)
```

Call this after `onAuthStateChanged` resolves. Use `me.role` to determine admin access.

### Bookmarks

```ts
// List
const bookmarks = await api.getBookmarks();
// → BookmarkEntry[] (empty array for guests)

// Toggle (add or remove)
const result = await api.toggleBookmark(eventId);
// → { bookmarked: true } (201 added) | { bookmarked: false } (200 removed)

// Explicit remove
await api.deleteBookmark(eventId);
```

Both `toggleBookmark` and `deleteBookmark` require authentication — they throw `LeapifyApiError` with code `UNAUTHORIZED` for guests.

### FAQs

```ts
const faqs = await api.getFaqs();
// → Faq[]
```

The `answer` field is markdown. Render it with a library such as [`react-markdown`](https://github.com/remarkjs/react-markdown):

```tsx
import ReactMarkdown from "react-markdown";
<ReactMarkdown>{faq.answer}</ReactMarkdown>
```

---

## 8. TypeScript Types

Import types directly from `leapify/types` — zero runtime cost (type-only import):

```ts
import type {
  LeapEvent,
  SlotInfo,
  UserProfile,
  BookmarkEntry,
  Faq,
  SiteConfig,
  ToggleBookmarkResult,
  EventStatus,
  UserRole,
} from "leapify/types";
```

Or import them alongside client utilities from `leapify/client`:

```ts
import { createLeapifyClient } from "leapify/client";
import type { LeapEvent } from "leapify/client";
```

---

## 9. Error Handling

All `api.*` methods throw `LeapifyApiError` on non-2xx responses.

```ts
import { LeapifyApiError, LEAPIFY_ERROR_CODES } from "leapify/client";

try {
  await api.toggleBookmark(eventId);
} catch (err) {
  if (err instanceof LeapifyApiError) {
    switch (err.code) {
      case LEAPIFY_ERROR_CODES.UNAUTHORIZED:
        // redirect to sign-in
        break;
      case LEAPIFY_ERROR_CODES.DOMAIN_RESTRICTED:
        // show "DLSU accounts only" message
        break;
      case LEAPIFY_ERROR_CODES.FORBIDDEN:
        // user doesn't have permission
        break;
      case LEAPIFY_ERROR_CODES.NOT_FOUND:
        // resource doesn't exist
        break;
      case LEAPIFY_ERROR_CODES.SERVICE_UNAVAILABLE:
        // maintenance mode — redirect to maintenance page
        break;
      default:
        // generic error UI
    }
  }
}
```

**Error code reference:**

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid Firebase token |
| `DOMAIN_RESTRICTED` | 403 | Email is not `@dlsu.edu.ph` |
| `FORBIDDEN` | 403 | User lacks required role (admin) |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource |
| `TOO_MANY_REQUESTS` | 429 | Rate limited |
| `SERVICE_UNAVAILABLE` | 503 | Maintenance mode active |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 10. Admin Gate Pattern

Gate admin-only UI using `UserProfile.role`:

```tsx
const me = await api.getMe();
const isAdmin = me?.role === "admin" || me?.role === "super_admin";

{isAdmin && (
  <AdminPanel>
    {/* PATCH /config/:key, POST /events, PATCH /events/:slug */}
  </AdminPanel>
)}
```

Admin mutations use the same client instance — the `Authorization` header carries the admin token and the backend enforces the role check server-side.

```ts
// Toggle maintenance mode
await api.updateConfig("maintenance_mode", true);

// Open registration globally
await api.updateConfig("registration_globally_open", true);
```

---

## 11. Registration Flow Checklist

When rendering the Register button on an event card:

```tsx
import type { LeapEvent, SlotInfo, SiteConfig } from "leapify/types";

function RegisterButton({
  event,
  slots,
  config,
}: {
  event: LeapEvent;
  slots: SlotInfo;
  config: SiteConfig;
}) {
  const now = config.now;

  const registrationOpen =
    config.registrationGloballyOpen &&
    !slots.isFull &&
    (!event.registrationOpensAt || now >= event.registrationOpensAt) &&
    (!event.registrationClosesAt || now < event.registrationClosesAt);

  if (slots.isFull) return <Button disabled>Full</Button>;
  if (!registrationOpen) return <Button disabled>Registration Closed</Button>;

  return (
    <a href={event.gformsUrl ?? "#"} target="_blank" rel="noopener noreferrer">
      <Button>Register</Button>
    </a>
  );
}
```

**Check order:**
1. `config.registrationGloballyOpen` — admin can close all registrations at once
2. `slots.isFull` — `registeredSlots >= maxSlots`
3. `registrationOpensAt` — registration hasn't opened yet
4. `registrationClosesAt` — registration window has closed
5. Redirect to `event.gformsUrl` — the Google Form handles the actual submission

> The slot counter is incremented automatically on the backend via the Google Forms Watch webhook — the frontend only needs to poll `/events/:slug/slots`.

---

## 12. Mounting the Server Handler

Leapify is a **Cloudflare-first** backend. The recommended deployment is a standalone Cloudflare Worker with all D1, KV, Queue, and secret bindings configured in `wrangler.toml`.

For **Cloudflare Pages** (colocated with your frontend):

```ts
// functions/api/[[path]].ts
import { createLeapify } from "leapify";

export const onRequest = createLeapify({
  allowedOrigins: ["https://yourdomain.com"],
}).fetch;
```

For **Next.js App Router** (Vercel / Node.js):

```ts
// app/api/[[...route]]/route.ts
import { createLeapify } from "leapify";
import { handle } from "hono/vercel";

const app = createLeapify({ allowedOrigins: ["https://yourdomain.com"] });
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
```

> **Note:** Cloudflare bindings (D1, KV, Queues) are only available on CF Workers/Pages. Vercel/Node.js deployments must adapt storage (e.g., Drizzle + Turso instead of D1). The `leapify` server import is intentionally separate from `leapify/client` to prevent server-side secrets from leaking into the browser bundle.
