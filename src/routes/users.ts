import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import type { LeapifyEnv } from '../types'
import { createDb } from '../db'
import { users } from '../db/schema/users'
import { bookmarks } from '../db/schema/bookmarks'
import { events } from '../db/schema/events'
import { authMiddleware } from '../auth/middleware'
import { notFound } from '../lib/errors'

export const usersRoute = new Hono<LeapifyEnv>()

// ── GET /users/me ─────────────────────────────────────────────────────────────
usersRoute.get('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  const db = createDb(c.env.DB)

  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.dbId),
  })

  if (!profile) throw notFound('User')

  return c.json({ data: profile })
})

// ── PATCH /users/me ───────────────────────────────────────────────────────────
usersRoute.patch('/me', authMiddleware, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ name?: string }>()
  const db = createDb(c.env.DB)

  const [updated] = await db
    .update(users)
    .set({ ...(body.name ? { name: body.name } : {}) })
    .where(eq(users.id, user.dbId))
    .returning()

  return c.json({ data: updated })
})

// ── GET /users/me/bookmarks ───────────────────────────────────────────────────
usersRoute.get('/me/bookmarks', authMiddleware, async (c) => {
  const user = c.get('user')
  const db = createDb(c.env.DB)

  const rows = await db.query.bookmarks.findMany({
    where: eq(bookmarks.userId, user.dbId),
    with: { event: true },
  })

  const data = rows.map((r) => ({ bookmarkedAt: r.createdAt, event: r.event }))
  return c.json({ data })
})

// ── POST /users/me/bookmarks/:eventId — toggle ────────────────────────────────
usersRoute.post('/me/bookmarks/:eventId', authMiddleware, async (c) => {
  const { eventId } = c.req.param()
  const user = c.get('user')
  const db = createDb(c.env.DB)

  // Verify event exists
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true },
  })
  if (!event) throw notFound('Event')

  // Toggle: try insert, if exists then delete
  const existing = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.userId, user.dbId),
  })

  if (existing) {
    await db.delete(bookmarks).where(eq(bookmarks.id, existing.id))
    return c.json({ data: { bookmarked: false } })
  }

  await db.insert(bookmarks).values({ userId: user.dbId, eventId })
  return c.json({ data: { bookmarked: true } }, 201)
})

// ── DELETE /users/me/bookmarks/:eventId ───────────────────────────────────────
usersRoute.delete('/me/bookmarks/:eventId', authMiddleware, async (c) => {
  const { eventId } = c.req.param()
  const user = c.get('user')
  const db = createDb(c.env.DB)

  await db
    .delete(bookmarks)
    .where(eq(bookmarks.userId, user.dbId) && eq(bookmarks.eventId, eventId))

  return c.json({ data: { bookmarked: false } })
})
