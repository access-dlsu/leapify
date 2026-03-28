import type { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types'

/**
 * Cloudflare bindings expected in the Worker environment.
 * These map directly to wrangler.toml bindings + Worker Secrets.
 */
export interface LeapifyBindings {
  // Infrastructure bindings (wrangler.toml)
  DB: D1Database
  KV: KVNamespace
  FILES?: R2Bucket
  EMAIL_QUEUE?: Queue

  // Secrets (set via `wrangler secret put`)
  FIREBASE_PROJECT_ID: string
  FIREBASE_WEB_API_KEY?: string
  GFORMS_SERVICE_ACCOUNT_JSON: string
  GFORMS_WEBHOOK_SECRET: string
  CONTENTFUL_SPACE_ID?: string
  CONTENTFUL_ACCESS_TOKEN?: string
  CONTENTFUL_ENVIRONMENT?: string
  RESEND_API_KEY?: string
  RESEND_FROM_ADDRESS?: string
  INTERNAL_API_SECRET: string
}

/**
 * Hono environment type for use across all route handlers.
 */
export interface LeapifyEnv {
  Bindings: LeapifyBindings
  Variables: {
    user: import('./auth/types').LeapifyUser
    gformsWebhookUrl: string | undefined
  }
}

/**
 * Known site_config keys with their value types.
 */
export interface SiteConfigMap {
  coming_soon_until: number        // unix epoch
  site_ends_at: number             // unix epoch
  site_name: string
  registration_globally_open: boolean
  maintenance_mode: boolean
  snapshot_completed: boolean
}

export type SiteConfigKey = keyof SiteConfigMap
