import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { LeapifyEnv } from './types'
import { errorHandler } from './lib/middleware/error-handler'
import { createCorsMiddleware } from './lib/middleware/cors'
import { healthRoute } from './routes/health'
import { eventsRoute } from './routes/events'
import { usersRoute } from './routes/users'
import { siteConfigRoute } from './routes/site-config'
import { faqsRoute } from './routes/faqs'
import { gformsWebhookRoute } from './routes/internal/gforms-webhook'

export interface LeapifyAppOptions {
  allowedOrigins?: string[]
}

export function createApp(options: LeapifyAppOptions = {}): Hono<LeapifyEnv> {
  const app = new Hono<LeapifyEnv>()

  // ── Global middleware ───────────────────────────────────────────────────────
  app.use('*', logger())
  app.use('*', createCorsMiddleware(options.allowedOrigins ?? ['*']))

  // ── Maintenance mode check ──────────────────────────────────────────────────
  app.use('*', async (c, next) => {
    // Skip for health and internal routes
    if (c.req.path === '/health' || c.req.path.startsWith('/internal')) {
      return next()
    }
    // Lazy maintenance check (only if KV is available)
    // Full implementation reads site_config; stub here for modularity
    return next()
  })

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.route('/health', healthRoute)
  app.route('/config', siteConfigRoute)
  app.route('/events', eventsRoute)
  app.route('/users', usersRoute)
  app.route('/faqs', faqsRoute)
  app.route('/internal/gforms-webhook', gformsWebhookRoute)

  // ── Error handler ───────────────────────────────────────────────────────────
  app.onError(errorHandler)

  // ── 404 ────────────────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404))

  return app
}
