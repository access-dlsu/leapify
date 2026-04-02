/**
 * Leapify — Standalone Cloudflare Worker entry point.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  MODE 1: Standalone Server (this file)
 * ─────────────────────────────────────────────────────────────────────
 * Deploy Leapify directly as a Cloudflare Worker — no frontend code
 * required. Configure wrangler.toml with your bindings + secrets and run:
 *
 *   wrangler deploy
 *
 * CORS is controlled via the ALLOWED_ORIGINS Worker secret:
 *   wrangler secret put ALLOWED_ORIGINS
 *   # value: "https://yoursite.com,https://www.yoursite.com"
 *
 * ─────────────────────────────────────────────────────────────────────
 *  MODE 2: npm module (src/index.ts)
 * ─────────────────────────────────────────────────────────────────────
 * Install leapify into your own project and mount it:
 *
 *   npm install leapify
 *
 *   import { createLeapify } from 'leapify'
 *   export default createLeapify({ allowedOrigins: ['https://yoursite.com'] })
 *
 * See README.md for full mode comparison.
 */

import { createLeapify } from './index'
import type { LeapifyBindings } from './types'
import type { LeapifyJob } from './queues/jobs'

/**
 * Parse ALLOWED_ORIGINS env var.
 * Falls back to [] which blocks all cross-origin requests (safest default).
 * Set to "*" to allow all origins (only appropriate for public-read APIs
 * without sensitive user data).
 */
function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

let app: ReturnType<typeof createLeapify> | null = null;

/**
 * Singleton Leapify app instance.
 * Ensures that startup logic (like email warnings) only runs once per Worker lifecycle.
 */
function getApp(env: LeapifyBindings): NonNullable<typeof app> {
  if (!app) {
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    app = createLeapify({ allowedOrigins });
  }
  return app;
}

const leapify = {
  fetch(request: Request, env: LeapifyBindings, ctx: ExecutionContext): Promise<Response> {
    return getApp(env).fetch(request, env, ctx);
  },

  async scheduled(event: ScheduledEvent, env: LeapifyBindings, ctx: ExecutionContext): Promise<void> {
    return getApp(env).scheduled(event, env, ctx);
  },

  async queue(batch: MessageBatch<LeapifyJob>, env: LeapifyBindings): Promise<void> {
    return getApp(env).queue(batch, env);
  },
};

export default leapify;
