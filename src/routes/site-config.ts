import { Hono } from 'hono'
import type { LeapifyEnv, SiteConfigKey, SiteConfigMap } from '../types'
import { createDb } from '../db'
import { siteConfig } from '../db/schema/site-config'
import { authMiddleware, adminMiddleware } from '../auth/middleware'

export const siteConfigRoute = new Hono<LeapifyEnv>()

// ── GET /config — public ──────────────────────────────────────────────────────
siteConfigRoute.get('/', async (c) => {
  const db = createDb(c.env.DB)

  const rows = await db.query.siteConfig.findMany()
  const config = Object.fromEntries(
    rows.map((r) => [r.key, JSON.parse(r.value)]),
  ) as Partial<SiteConfigMap>

  return c.json({
    data: {
      comingSoonUntil: config.coming_soon_until ?? null,
      siteEndsAt: config.site_ends_at ?? null,
      siteName: config.site_name ?? null,
      registrationGloballyOpen: config.registration_globally_open ?? true,
      maintenanceMode: config.maintenance_mode ?? false,
      now: Math.floor(Date.now() / 1000),
    },
  })
})

// ── PATCH /config/:key — admin only ──────────────────────────────────────────
siteConfigRoute.patch('/:key', authMiddleware, adminMiddleware, async (c) => {
  const key = c.req.param('key') as SiteConfigKey
  const { value } = await c.req.json<{ value: SiteConfigMap[typeof key] }>()

  const db = createDb(c.env.DB)
  const now = Math.floor(Date.now() / 1000)

  await db
    .insert(siteConfig)
    .values({ key, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({
      target: siteConfig.key,
      set: { value: JSON.stringify(value), updatedAt: now },
    })

  return c.json({ data: { key, value } })
})
