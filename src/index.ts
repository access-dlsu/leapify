/**
 * Leapify — Universal backend module for DLSU CSO LEAP event websites.
 * Published to npm. Consumers drop it in and export it directly.
 *
 * ─── Consumer usage (zero source-code changes required) ───────────────────────
 *
 * // worker.ts
 * import { createLeapify } from 'leapify'
 *
 * export default createLeapify({
 *   allowedOrigins: ['https://yourleapsite.com'],
 * })
 *
 * That's it. `createLeapify` returns an object shaped for CF Workers:
 *   { fetch, scheduled, queue }
 *
 * ─── wrangler.toml ────────────────────────────────────────────────────────────
 * main = "worker.ts"
 * (see wrangler.toml.example in the package for full config)
 */

import { createApp, type LeapifyAppOptions } from './app'
import { createQueueHandler } from './queues/handlers'
import { batchRelease } from './cron/batch-release'
import { reconcileSlots } from './cron/reconcile-slots'
import { reminderEmails } from './cron/reminder-emails'
import { lifecycleCheck } from './cron/lifecycle-check'
import { renewWatches } from './cron/renew-watches'
import type { LeapifyBindings } from './types'
import type { LeapifyJob } from './queues/jobs'

export interface LeapifyOptions extends LeapifyAppOptions {}

/**
 * Primary factory function. Returns a Cloudflare Workers-compatible export object.
 *
 * @example
 * // worker.ts — the entire consumer worker implementation
 * import { createLeapify } from 'leapify'
 * export default createLeapify({ allowedOrigins: ['https://yourdomain.com'] })
 */
export function createLeapify(options: LeapifyOptions = {}) {
  const app = createApp(options)

  return {
    /**
     * Cloudflare Workers fetch handler.
     * Handles all HTTP requests routed through Leapify.
     */
    fetch(request: Request, env: LeapifyBindings, ctx: ExecutionContext): Promise<Response> {
      return Promise.resolve(app.fetch(request, env, ctx))
    },

    // Cloudflare Workers scheduled handler. Routes cron triggers by schedule string.
    // Cron schedule (configured in wrangler.toml):
    //   "* * * * *"   → batch-release
    //   "*/5 * * * *" → reconcile-slots
    //   "0 * * * *"   → reminder-emails + lifecycle-check
    //   "0 0 * * *"   → renew-watches
    async scheduled(event: ScheduledEvent, env: LeapifyBindings, ctx: ExecutionContext): Promise<void> {
      const { cron } = event

      if (cron === '* * * * *') await batchRelease(env)
      if (cron === '*/5 * * * *') await reconcileSlots(env)
      if (cron === '0 * * * *') {
        ctx.waitUntil(Promise.all([reminderEmails(env), lifecycleCheck(env, ctx)]))
      }
      if (cron === '0 0 * * *') await renewWatches(env)
    },

    /**
     * Cloudflare Queue consumer.
     * Processes async jobs (emails, audit logs, snapshots, watch renewals).
     */
    async queue(batch: MessageBatch<LeapifyJob>, env: LeapifyBindings): Promise<void> {
      const handler = createQueueHandler(env)
      return handler(batch)
    },
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { createQueueHandler } from './queues/handlers'
export { createDb } from './db'

export type { LeapifyBindings, LeapifyEnv, SiteConfigKey, SiteConfigMap } from './types'
export type { LeapifyUser, FirebaseTokenClaims } from './auth/types'
export type { LeapifyDb } from './db'
export type { LeapifyJob } from './queues/jobs'
export type { SlotInfo } from './services/slots'

// Schema re-exports for consumers running drizzle-kit migrations
export * from './db/schema'
