/**
 * Browser-safe TypeScript types for the Leapify API.
 * Import from 'leapify/types' — no Cloudflare, Drizzle, or Hono dependencies.
 */

export type EventStatus =
  | 'draft'
  | 'queued'
  | 'published'
  | 'ended'
  | 'cancelled'

export type UserRole = 'student' | 'admin' | 'super_admin'

/**
 * A published event as returned by GET /events and GET /events/:slug.
 *
 * Note: The list endpoint (GET /events) returns a subset of fields for
 * performance — internal fields like gformsId, watchId, and reminder flags
 * are omitted. The detail endpoint (GET /events/:slug) returns the full shape.
 * This type covers the union of both; extra fields are nullable/optional.
 */
export interface LeapEvent {
  id: string
  slug: string
  categoryName: string
  categoryPath: string
  title: string
  org: string | null
  venue: string | null
  dateTime: string | null
  startsAt: number | null
  endsAt: number | null
  price: string | null
  backgroundColor: string | null
  backgroundImageUrl: string | null
  subtheme: string | null
  isMajor: boolean
  maxSlots: number
  registeredSlots: number
  gformsUrl: string | null
  registrationOpensAt: number | null
  registrationClosesAt: number | null
  publishedAt: number | null
  // Present only on GET /events/:slug
  status?: EventStatus
  createdAt?: number
}

/**
 * Real-time slot availability from GET /events/:slug/slots.
 * Refreshes every 5 seconds at the CF edge.
 */
export interface SlotInfo {
  available: number
  total: number
  registered: number
  isFull: boolean
}

/**
 * Authenticated user profile from GET /users/me.
 * Returns null if the request is unauthenticated.
 */
export interface UserProfile {
  id: string
  /** Google user ID (sub claim from JWT). */
  googleUid: string
  email: string
  name: string
  role: UserRole
  createdAt: number
}

/**
 * A single entry in the user's bookmark list from GET /users/me/bookmarks.
 */
export interface BookmarkEntry {
  bookmarkedAt: number
  event: LeapEvent
}

/**
 * A single FAQ item from GET /faqs.
 * The `answer` field is markdown.
 */
export interface Faq {
  id: string
  question: string
  answer: string
  category: string | null
  sortOrder: number
  isActive: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Site-wide configuration from GET /config.
 * Use `now` (server unix epoch) for timestamp comparisons to avoid
 * client clock drift.
 */
export interface SiteConfig {
  comingSoonUntil: number | null
  siteEndsAt: number | null
  siteName: string | null
  registrationGloballyOpen: boolean
  maintenanceMode: boolean
  now: number
}

/**
 * Result of POST /users/me/bookmarks/:eventId (toggle) and
 * DELETE /users/me/bookmarks/:eventId.
 */
export interface ToggleBookmarkResult {
  bookmarked: boolean
}

/**
 * Standard error response shape from the Leapify API.
 * Thrown as LeapifyApiError by the client.
 */
export interface LeapifyErrorBody {
  error: {
    code: string
    message: string
  }
}

// ─── Admin mutation types ───────────────────────────────────────────────────

/**
 * Body for POST /events (create event).
 * Only required fields are marked; rest are optional.
 */
export interface CreateEventBody {
  slug: string
  categoryName: string
  categoryPath: string
  title: string
  org?: string | null
  venue?: string | null
  dateTime?: string | null
  startsAt?: number | null
  endsAt?: number | null
  price?: string | null
  backgroundColor?: string | null
  backgroundImageUrl?: string | null
  subtheme?: string | null
  isMajor?: boolean
  maxSlots?: number
  gformsId?: string | null
  gformsUrl?: string | null
  releaseAt?: number | null
  registrationOpensAt?: number | null
  registrationClosesAt?: number | null
  contentfulEntryId?: string | null
  status?: 'draft' | 'queued' | 'published'
}

/**
 * Body for PATCH /events/:slug (update event).
 * All fields optional — only provided fields are updated.
 */
export type UpdateEventBody = Partial<CreateEventBody>

/**
 * Body for POST /faqs (create FAQ).
 */
export interface CreateFaqBody {
  question: string
  answer: string
  category?: string | null
  sortOrder?: number
}

/**
 * Body for PATCH /faqs/:id (update FAQ).
 * All fields optional — only provided fields are updated.
 */
export type UpdateFaqBody = Partial<CreateFaqBody>

/**
 * Typed map of site config keys to their value types.
 */
export interface SiteConfigMap {
  coming_soon_until: number
  site_ends_at: number
  site_name: string
  registration_globally_open: boolean
  maintenance_mode: boolean
  snapshot_completed: boolean
}

/**
 * Valid site config keys.
 */
export type SiteConfigKey = keyof SiteConfigMap
