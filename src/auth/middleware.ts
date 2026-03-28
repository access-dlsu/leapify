import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { verifyFirebaseToken, fetchGoogleCerts } from './jwt'
import { domainRestricted, unauthorized, forbidden } from '../lib/errors'
import { createDb } from '../db'
import { users } from '../db/schema/users'
import type { LeapifyBindings } from '../types'
import type { LeapifyUser } from './types'

const CERTS_KV_KEY = 'auth:google-certs'
const USER_KV_PREFIX = 'auth:user:'
const DLSU_DOMAIN = '@dlsu.edu.ph'
const USER_KV_TTL = 3600 // 1 hour

// ─── Context type augmentation ────────────────────────────────────────────────
declare module 'hono' {
  interface ContextVariableMap {
    user: LeapifyUser
  }
}

// ─── Auth middleware (required) ───────────────────────────────────────────────

export const authMiddleware = createMiddleware<{ Bindings: LeapifyBindings }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized('Missing or malformed Authorization header')
    }

    const token = authHeader.slice(7)
    const { KV, DB, FIREBASE_PROJECT_ID } = c.env

    // ── Step 1: quick UID extract for KV cache check ──────────────────
    let uid: string | undefined
    try {
      const payloadB64 = token.split('.')[1]
      if (payloadB64) {
        const payload = JSON.parse(
          atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')),
        ) as { sub?: string }
        uid = payload.sub
      }
    } catch {
      // ignore — will fail at full verification below
    }

    // ── Step 2: KV cache hit → skip Firebase entirely ─────────────────
    if (uid) {
      const cached = await KV.get<LeapifyUser>(`${USER_KV_PREFIX}${uid}`, 'json')
      if (cached) {
        c.set('user', cached)
        return next()
      }
    }

    // ── Step 3: verify JWT using Google's public certs ────────────────
    const getCerts = async () => {
      const cached = await KV.get<Record<string, string>>(CERTS_KV_KEY, 'json')
      if (cached) return cached

      const { certs, ttl } = await fetchGoogleCerts()
      await KV.put(CERTS_KV_KEY, JSON.stringify(certs), { expirationTtl: ttl })
      return certs
    }

    const claims = await verifyFirebaseToken(token, FIREBASE_PROJECT_ID, getCerts)

    // ── Step 4: enforce DLSU domain ───────────────────────────────────
    // Firebase hd param handles the UX layer; this is the security layer.
    if (!claims.email.endsWith(DLSU_DOMAIN)) {
      throw domainRestricted()
    }

    // ── Step 5: upsert user in D1 and retrieve role ───────────────────
    const db = createDb(DB)

    let dbUser = await db.query.users.findFirst({
      where: eq(users.firebaseUid, claims.sub),
    })

    if (!dbUser) {
      const [created] = await db
        .insert(users)
        .values({
          firebaseUid: claims.sub,
          email: claims.email,
          name: claims.name ?? claims.email.split('@')[0],
        })
        .returning()
      dbUser = created
    }

    if (!dbUser) throw unauthorized('Failed to resolve user')

    // ── Step 6: build LeapifyUser and cache in KV ─────────────────────
    const leapifyUser: LeapifyUser = {
      ...claims,
      uid: claims.sub,
      dbId: dbUser.id,
      role: dbUser.role,
    }

    const ttlRemaining = claims.exp - Math.floor(Date.now() / 1000)
    const kvTtl = Math.min(ttlRemaining, USER_KV_TTL)
    if (kvTtl > 0) {
      await KV.put(`${USER_KV_PREFIX}${claims.sub}`, JSON.stringify(leapifyUser), {
        expirationTtl: kvTtl,
      })
    }

    c.set('user', leapifyUser)
    return next()
  },
)

// ─── Admin guard (use after authMiddleware) ───────────────────────────────────

export const adminMiddleware = createMiddleware<{ Bindings: LeapifyBindings }>(
  async (c, next) => {
    const user = c.get('user')
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      throw forbidden('Admin access required')
    }
    return next()
  },
)

// ─── Internal route guard ─────────────────────────────────────────────────────

export const internalMiddleware = createMiddleware<{ Bindings: LeapifyBindings }>(
  async (c, next) => {
    const secret = c.req.header('X-Internal-Secret')
    if (!secret || secret !== c.env.INTERNAL_API_SECRET) {
      throw forbidden('Invalid internal secret')
    }
    return next()
  },
)
