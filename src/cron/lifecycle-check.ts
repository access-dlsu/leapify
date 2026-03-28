import type { LeapifyBindings } from '../types'
import { createDb } from '../db'
import { siteConfig } from '../db/schema/site-config'
import { eq } from 'drizzle-orm'

/**
 * Cron: every hour (`0 * * * *`)
 *
 * Detects when siteEndsAt has passed and triggers the one-time
 * Contentful → D1 content snapshot. Sets snapshot_completed flag
 * to prevent re-runs.
 */
export async function lifecycleCheck(
  env: LeapifyBindings,
  ctx: ExecutionContext,
): Promise<void> {
  const db = createDb(env.DB)
  const now = Math.floor(Date.now() / 1000)

  // Read site_ends_at and snapshot_completed from site_config
  const rows = await db.query.siteConfig.findMany({
    where: (t, { inArray }) => inArray(t.key, ['site_ends_at', 'snapshot_completed']),
  })

  const config = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]))
  const siteEndsAt = config['site_ends_at'] as number | undefined
  const snapshotCompleted = config['snapshot_completed'] as boolean | undefined

  if (!siteEndsAt || snapshotCompleted) return

  if (now >= siteEndsAt) {
    console.log('[lifecycle-check] siteEndsAt passed — triggering content snapshot.')

    // Mark as completed FIRST to prevent duplicate triggers on re-run
    await db
      .update(siteConfig)
      .set({ value: 'true', updatedAt: now })
      .where(eq(siteConfig.key, 'snapshot_completed'))

    // Queue the snapshot job (processed by queue consumer)
    if (env.EMAIL_QUEUE) {
      ctx.waitUntil(
        env.EMAIL_QUEUE.send({ type: 'snapshot_content', payload: { triggeredAt: now } }),
      )
    }
  }
}
