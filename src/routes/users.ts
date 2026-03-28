import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { LeapifyEnv } from '../types'
import { createDb } from '../db'
import { users } from '../db/schema/users'
import { bookmarks } from '../db/schema/bookmarks'
import { events } from '../db/schema/events'
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware'
import { notFound } from '../lib/errors'

export const usersRoute = new Hono<LeapifyEnv>()

// ── GET /users/me ─────────────────────────────────────────────────────────────
usersRoute.get('/me', optionalAuthMiddleware, async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ data: null })

  const db = createDb(c.env.DB)
  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.dbId),
  })

  if (!profile) return c.json({ data: null })

  return c.json({ data: profile })
})


// ── GET /users/me/bookmarks ───────────────────────────────────────────────────
usersRoute.get('/me/bookmarks', optionalAuthMiddleware, async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ data: [] })

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
    // Must match BOTH userId and eventId — matching userId alone would
    // accidentally delete a bookmark for a different event.
    where: and(eq(bookmarks.userId, user.dbId), eq(bookmarks.eventId, eventId)),
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
    // JS `&&` evaluates to the right-hand eq() only — must use Drizzle and().
    .where(and(eq(bookmarks.userId, user.dbId), eq(bookmarks.eventId, eventId)))

  return c.json({ data: { bookmarked: false } })
})
