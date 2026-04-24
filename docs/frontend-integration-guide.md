# Leapify Frontend Integration Guide

> **Audience:** Frontend developers building student-facing sites on top of the Leapify backend.

This guide covers everything you need to integrate Leapify into a Next.js (App Router) project: install, auth, API calls, admin mutations, error handling, and deployment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install](#2-install)
3. [Environment Variables](#3-environment-variables)
4. [GIS (Google Identity Services) Setup](#4-gis-setup)
5. [Leapify Client Setup](#5-leapify-client-setup)
6. [Public API Calls](#6-public-api-calls)
7. [Authenticated API Calls](#7-authenticated-api-calls)
8. [Admin API Calls](#8-admin-api-calls)
9. [Error Handling](#9-error-handling)
10. [Deployment](#10-deployment)

---

## 1. Prerequisites

- Node.js 18+ and npm
- A deployed Leapify Worker (see [Backend Guide](./BACKEND-GUIDE.md))
- Google OAuth 2.0 Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

---

## 2. Install

```bash
npm install leapify
```

---

## 3. Environment Variables

Frontend `.env.local` only needs public values — all secret keys (Contentful, Amazon SES, CF bindings) live in the Worker's `.env` / `wrangler.toml` secrets:

```env
# Leapify API
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

> `GOOGLE_CLIENT_ID` must match the Worker secret of the same name — used to verify JWT issuer.

---

## 4. GIS Setup

Install the Google Identity Services script in your app layout or a dedicated provider:

```tsx
// lib/google-auth.ts
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!
```

---

## 5. Leapify Client Setup

Create a singleton client in `lib/api.ts`:

```ts
// lib/api.ts
import { createLeapifyClient, initGoogleSignIn } from 'leapify/client'
import { GOOGLE_CLIENT_ID } from './google-auth'

let currentJwt: string | null = null

// Initialize GIS once on app load
await initGoogleSignIn({
  clientId: GOOGLE_CLIENT_ID,
  hostedDomain: 'dlsu.edu.ph',
  callback: (jwt) => {
    currentJwt = jwt
  },
})

export const api = createLeapifyClient(
  process.env.NEXT_PUBLIC_API_URL!,
  () => currentJwt,
)

export { currentJwt }
```

---

## 6. Public API Calls

These don't require authentication:

```ts
import { api } from '@/lib/api'

// Events
const events = await api.getEvents() // → LeapEvent[]
const event = await api.getEvent('my-event') // → LeapEvent
const slots = await api.getSlots('my-event') // → SlotInfo

// Config
const config = await api.getConfig() // → SiteConfig

// FAQs
const faqs = await api.getFaqs() // → Faq[]
```

---

## 7. Authenticated API Calls

These require a valid Google JWT. The client auto-attaches the `Authorization` header:

```ts
import { api } from '@/lib/api'

// User profile
const me = await api.getMe() // → UserProfile | null

// Bookmarks
const bookmarks = await api.getBookmarks() // → BookmarkEntry[]
await api.toggleBookmark('event-id') // → { bookmarked: boolean }
await api.deleteBookmark('event-id') // → { bookmarked: boolean }
```

---

## 8. Admin API Calls

These require an admin role (set in D1 `users` table):

```ts
import { api } from '@/lib/api'

// Events
await api.createEvent({
  slug: 'new-event',
  title: 'New Event',
  categoryName: 'Workshop',
  categoryPath: '/workshops',
})

await api.updateEvent('new-event', {
  title: 'Updated Title',
  maxSlots: 100,
})

// FAQs
await api.createFaq({
  question: 'What is LEAP?',
  answer: 'A DLSU CSO event.',
})

await api.updateFaq('faq-id', {
  answer: 'Updated answer.',
})

await api.deleteFaq('faq-id') // soft delete (isActive: false)

// Site config (type-safe keys)
await api.setConfig('maintenance_mode', true)
await api.setConfig('site_name', 'LEAP 2026')
await api.setConfig('registration_globally_open', true)
```

---

## 9. Error Handling

All API methods throw `LeapifyApiError` on non-2xx responses:

```ts
import { api } from '@/lib/api'
import { LeapifyApiError } from 'leapify/client'

try {
  await api.toggleBookmark('event-id')
} catch (err) {
  if (err instanceof LeapifyApiError) {
    switch (err.code) {
      case 'UNAUTHORIZED':
        // redirect to sign-in
        break
      case 'DOMAIN_RESTRICTED':
        // show "use @dlsu.edu.ph" message
        break
      case 'TOO_MANY_REQUESTS':
        // show retry-after message
        break
      default:
        console.error(err.message)
    }
  }
}
```

---

## 10. Deployment

### Cloudflare Pages

```bash
# Build
npm run build

# Deploy
wrangler pages deploy .vercel/output/static
```

### Vercel

```bash
# Build
npm run build

# Deploy
vercel --prod
```

### Netlify

```bash
# Build
npm run build

# Deploy
netlify deploy --prod
```

---

## Type Imports

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

## API Reference

| Method      | Path                           | Auth     | Description                 |
| ----------- | ------------------------------ | -------- | --------------------------- |
| `GET`       | `/events`                      | None     | List published events       |
| `GET`       | `/events/:slug`                | None     | Get event by slug           |
| `GET`       | `/events/:slug/slots`          | None     | Real-time slot availability |
| `POST`      | `/events`                      | Admin    | Create event                |
| `PATCH`     | `/events/:slug`                | Admin    | Update event                |
| `GET`       | `/users/me`                    | User     | Current user profile        |
| `GET`       | `/users/me/bookmarks`          | Optional | User's bookmarks            |
| `POST`      | `/users/me/bookmarks/:eventId` | User     | Toggle bookmark             |
| `DELETE`    | `/users/me/bookmarks/:eventId` | User     | Remove bookmark             |
| `GET`       | `/faqs`                        | None     | List active FAQs            |
| `POST`      | `/faqs`                        | Admin    | Create FAQ                  |
| `PATCH`     | `/faqs/:id`                    | Admin    | Update FAQ                  |
| `DELETE`    | `/faqs/:id`                    | Admin    | Soft-delete FAQ             |
| `GET/PATCH` | `/config`                      | Admin    | Site configuration          |

### Error Codes

| Code                  | HTTP | Description            |
| --------------------- | ---- | ---------------------- |
| `UNAUTHORIZED`        | 401  | Missing or invalid JWT |
| `DOMAIN_RESTRICTED`   | 403  | Email not @dlsu.edu.ph |
| `FORBIDDEN`           | 403  | User lacks admin role  |
| `NOT_FOUND`           | 404  | Resource not found     |
| `VALIDATION_ERROR`    | 422  | Invalid request body   |
| `TOO_MANY_REQUESTS`   | 429  | Rate limit exceeded    |
| `SERVICE_UNAVAILABLE` | 503  | Maintenance mode       |
