import { Hono } from 'hono'
import type { LeapifyEnv } from '../types'

export const healthRoute = new Hono<LeapifyEnv>()

/**
 * GET /health
 *
 * Publicly accessible — no CORS restriction, no auth.
 * Used by uptime monitors, load balancers, and CF Health Checks.
 *
 * Response shape:
 *   { status: 'ok', timestamp: string, providers: { ses: boolean, resend: boolean } }
 *
 * `providers` reflects which email providers are configured in this Worker
 * so operators can confirm secrets were set correctly after deploy.
 */
healthRoute.get('/', (c) => {
  const hasSes =
    Boolean(c.env.SES_REGION) &&
    Boolean(c.env.SES_ACCESS_KEY_ID) &&
    Boolean(c.env.SES_SECRET_ACCESS_KEY)

  const hasResend = Boolean(c.env.RESEND_API_KEY)

  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      ses: hasSes,
      resend: hasResend,
    },
  })
})
